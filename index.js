const fs = require('fs');
const path = require('path');
const axios = require('axios');

const parser = require("./parser.js");

const MAX_PARALLEL_REQUESTS = 10;

const dir = "data";
const exportPath = path.join(__dirname, dir);
const instituteDir = "institutes";
const timetableDir = "timetables";

const selectiveDir = "selective";
const selectiveSuffix = "schedule_selective";

doStudentScheduleParsing().then(() => {
    return doSelectiveParsing();
});

async function doStudentScheduleParsing() {
    console.log("Downloading student schedule")
    let institutes = await getInstitutes().catch(err => {
        console.log("Got error while downloading institutes:", err);
        process.exit(1)
        return;
    })
    writeFile(path.join(exportPath, "institutes.json"), JSON.stringify(institutes, null, 4));

    for (let institute of institutes) {
        await getGroups(institute).then(async groups => {
            writeFile(path.join(exportPath, instituteDir, institute + ".json"), JSON.stringify(groups, null, 4));
        })
    }

    let groups = await getGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1)
        return;
    });
    groups = groups.map(el => el.trim());
    writeFile(path.join(exportPath, "groups.json"), JSON.stringify(groups, null, 4));

    await fetchTimetables(groups, timetableDir);

    console.log("Done!");
}

async function doSelectiveParsing() {
    console.log("Downloading selective schedule")
    parser.setSuffix(selectiveSuffix);

    let groups = await getGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1)
        return;
    });
    groups = groups.map(el => el.trim());
    writeFile(path.join(exportPath, selectiveDir, "groups.json"), JSON.stringify(groups, null, 4));

    await fetchTimetables(groups, path.join(selectiveDir, timetableDir));
    console.log("Done!")
}

async function fetchTimetables(groups) {
    const requests = groups.map((group) => parser.prepareTimetableRequest(group));
    const requestQueue = [];
    let currentPosition = 0;
    for (; currentPosition < MAX_PARALLEL_REQUESTS; currentPosition++) {
        requestQueue.push(axios(requests[currentPosition]));
    }

    while (requestQueue.length) {
        const request = await requestQueue.shift();
        handleResponse(request);
        if (currentPosition < requests.length) {
            requestQueue.push(axios(requests[currentPosition]));
            currentPosition++;
        }
    }
}

function handleResponse(element) {
    const url = new URL(element.config.url);
    const group = url.searchParams.get('studygroup_abbrname_selective');
    console.log('Parsing ' + group);
    if (element.error) {
        console.error(element.error);
        return;
    }

    try {
        const timetable = parser.parseTimetable(element.data);
        writeFile(path.join(exportPath, dir, group + ".json"), JSON.stringify(timetable, null, 4));
    } catch (e) {
        console.error(e);
    }
}

async function getGroups(institute) {
    console.log("Downloading groups " + (institute || ""))
    let groups = await parser.getGroups(institute)
    groups.sort(localeCompare);
    return groups;
}

async function getInstitutes() {
    console.log("Downloading institutes");
    let inst = await parser.getInstitutes()
    inst.sort(localeCompare);
    return inst;
}

function writeFile(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFile(filePath, contents, err => {
        if (err) console.log("Error: ", err);
    });
}

function localeCompare(a, b) {
    return a.localeCompare(b);
}