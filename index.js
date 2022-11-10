import { mkdirSync, writeFile as _writeFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

import { setSuffix, prepareTimetableRequest, parseTimetable, getGroups, getInstitutes } from "./parser.js";

const MAX_PARALLEL_REQUESTS = 10;

const dir = "data";
const exportPath = join(dirname(fileURLToPath(import.meta.url)), dir);
const instituteDir = "institutes";
const timetableDir = "timetables";

const selectiveDir = "selective";
const selectiveSuffix = "schedule_selective";

doStudentScheduleParsing().then(() => {
    return doSelectiveParsing();
});

async function doStudentScheduleParsing() {
    console.log("Downloading student schedule")
    let institutes = await downloadInstitutes().catch(err => {
        console.log("Got error while downloading institutes:", err);
        process.exit(1)
        return;
    })
    writeFile(join(exportPath, "institutes.json"), JSON.stringify(institutes, null, 4));

    for (let institute of institutes) {
        await downloadGroups(institute).then(async groups => {
            writeFile(join(exportPath, instituteDir, institute + ".json"), JSON.stringify(groups, null, 4));
        })
    }

    let groups = await downloadGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1)
        return;
    });
    groups = groups.map(el => el.trim());
    writeFile(join(exportPath, "groups.json"), JSON.stringify(groups, null, 4));

    await fetchTimetables(groups, timetableDir);

    console.log("Done!");
}

async function doSelectiveParsing() {
    console.log("Downloading selective schedule")
    setSuffix(selectiveSuffix);

    let groups = await downloadGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1)
        return;
    });
    groups = groups.map(el => el.trim());
    writeFile(join(exportPath, selectiveDir, "groups.json"), JSON.stringify(groups, null, 4));

    await fetchTimetables(groups, join(selectiveDir, timetableDir));
    console.log("Done!")
}

async function fetchTimetables(groups, dir) {
    const requests = groups.map((group) => prepareTimetableRequest(group));
    const requestQueue = [];
    let currentPosition = 0;
    for (; currentPosition < MAX_PARALLEL_REQUESTS; currentPosition++) {
        requestQueue.push(axios(requests[currentPosition]));
    }

    while (requestQueue.length) {
        const request = await requestQueue.shift();
        handleResponse(request, dir);
        if (currentPosition < requests.length) {
            requestQueue.push(axios(requests[currentPosition]));
            currentPosition++;
        }
    }
}

function handleResponse(element, dir) {
    const url = new URL(element.config.url);
    const group = url.searchParams.get('studygroup_abbrname_selective');
    console.log('Parsing ' + group);
    if (element.error) {
        console.error(element.error);
        return;
    }

    try {
        const timetable = parseTimetable(element.data);
        writeFile(join(exportPath, dir, group + ".json"), JSON.stringify(timetable, null, 4));
    } catch (e) {
        console.error(e);
    }
}

async function downloadGroups(institute) {
    console.log("Downloading groups " + (institute || ""))
    let groups = await getGroups(institute)
    groups.sort(localeCompare);
    return groups;
}

async function downloadInstitutes() {
    console.log("Downloading institutes");
    let inst = await getInstitutes()
    inst.sort(localeCompare);
    return inst;
}

function writeFile(filePath, contents) {
    mkdirSync(dirname(filePath), { recursive: true });

    _writeFile(filePath, contents, err => {
        if (err) console.log("Error: ", err);
    });
}

function localeCompare(a, b) {
    return a.localeCompare(b);
}