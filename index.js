const fs = require('fs');
const path = require('path');

const parser = require("./parser.js");

const dir = "data";
const exportPath = path.join(__dirname, dir);
const instituteDir = "institutes";
const timetableDir = "timetables";

doParsing();

async function doParsing() {
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

    let groups2 = groups.splice(0, groups.length / 2);

    await Promise.all([fetchTimetables(groups), fetchTimetables(groups2)]); // I/O works in async mode

    console.log("Done!");
}

async function fetchTimetables(groups) {
    let failed = [];
    for (let group of groups) {
        await getTimetable(group).then(async timetable => {
            writeFile(path.join(exportPath, timetableDir, group + ".json"), JSON.stringify(timetable, null, 4));
        }).catch(err => {
            console.log(`Failed to get timetable for ${group}. Retrying later`);
            failed.push(group);
        })
    }

    for (let group of failed) {
        await getTimetable(group).then(async timetable => {
            writeFile(path.join(exportPath, timetableDir, group + ".json"), JSON.stringify(timetable, null, 4));
        }).catch(err => {
            console.log(`Failed again while trying to get timetable for ${group}. Error:`, err);
        })
    }
}

async function getTimetable(group) {
    console.log("Downloading group " + group + " timetable")
    return parser.getTimetable(group).catch(err => {
        return parser.getTimetable(group).catch(err => { // try again
            return parser.getTimetable(group); // and again
        });
    })
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