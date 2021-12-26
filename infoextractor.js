let minimist = require("minimist");
let axios = require("axios");
let jsdom = require("jsdom");
let xl = require("excel4node");
let pdf = require("pdf-lib");
let path = require("path");
let fs = require("fs");

// node infoextractor.js --source=https://www.espncricinfo.com/series/icc-cricket-world-cup-2019-1144415/match-results --excel=worldcup.csv --dataFolder=data

let args = minimist(process.argv);

// download using axios
let responsePromise = axios.get(args.source);
responsePromise
  .then(function (res) {
    let html = res.data;
    let dom = new jsdom.JSDOM(html);
    let document = dom.window.document;

    let matches = [];
    let matchInfoDivs = document.querySelectorAll("div.match-score-block");

    for (let i = 0; i < matchInfoDivs.length; i++) {
      let match = {};

      let names = matchInfoDivs[i].querySelectorAll("p.name");
      match.team1 = names[0].textContent;
      match.team2 = names[1].textContent;

      let spanScores = matchInfoDivs[i].querySelectorAll("span.score");
      match.team1Score = "";
      match.team2Score = "";

      if (spanScores.length === 2) {
        match.team1Score = spanScores[0].textContent;
        match.team2Score = spanScores[1].textContent;
      } else if (spanScores.length === 1) {
        match.team1Score = spanScores[0].textContent;
      }

      let resultDiv = matchInfoDivs[i].querySelector("div.status-text > span");
      match.result = resultDiv.textContent;

      matches.push(match);
    }

    // console.log(matches);

    let teams = [];

    // Push team in teams if not already there
    for (let i = 0; i < matches.length; i++) {
      pushTeamInTeamsIfNotAlreadyThere(teams, matches[i].team1);
      pushTeamInTeamsIfNotAlreadyThere(teams, matches[i].team2);
    }

    // Push match at appropriate team
    for (let i = 0; i < matches.length; i++) {
      pushMatchInAppropriateTeam(
        teams,
        matches[i].team1,
        matches[i].team2,
        matches[i].team1Score,
        matches[i].team2Score,
        matches[i].result
      );

      pushMatchInAppropriateTeam(
        teams,
        matches[i].team2,
        matches[i].team1,
        matches[i].team2Score,
        matches[i].team1Score,
        matches[i].result
      );
    }

    prepareExcel(teams, args.excel);

    prepareFoldersAndPdfs(teams, args.dataFolder);
  })
  .catch(function (err) {
    console.log(err);
  });

function pushTeamInTeamsIfNotAlreadyThere(teams, teamName) {
  let tidx = -1;
  for (let j = 0; j < teams.length; j++) {
    if (teams[j].name === teamName) {
      tidx = j;
    }
  }

  if (tidx === -1) {
    let team = {
      name: teamName,
      matches: [],
    };
    teams.push(team);
  }
}

function pushMatchInAppropriateTeam(
  teams,
  homeTeam,
  opponentTeam,
  selfScore,
  oppScore,
  result
) {
  let tIdx = -1;
  for (let i = 0; i < teams.length; i++) {
    if (teams[i].name === homeTeam) {
      tIdx = i;
      break;
    }
  }

  let team = teams[tIdx];
  team.matches.push({
    vs: opponentTeam,
    selfScore,
    oppScore,
    result,
  });
}

function prepareExcel(teams, excelFileName) {
  let wb = new xl.Workbook();
  for (let i = 0; i < teams.length; i++) {
    let tsheet = wb.addWorksheet(teams[i].name);
    tsheet.cell(1, 1).string("vs");
    tsheet.cell(1, 2).string("Self Score");
    tsheet.cell(1, 3).string("Opponent Score");
    tsheet.cell(1, 4).string("Result");
    for (let j = 0; j < teams[i].matches.length; j++) {
      tsheet.cell(j + 2, 1).string(teams[i].matches[j].vs);
      tsheet.cell(j + 2, 2).string(teams[i].matches[j].selfScore);
      tsheet.cell(j + 2, 3).string(teams[i].matches[j].oppScore);
      tsheet.cell(j + 2, 4).string(teams[i].matches[j].result);
    }
  }

  wb.write(excelFileName);
}

function prepareFoldersAndPdfs(teams, dataDir) {
  if (fs.existsSync(dataDir)) {
    fs.rmdirSync(dataDir, { recursive: true });
  }

  fs.mkdirSync(dataDir);

  for (let i = 0; i < teams.length; i++) {
    let teamFolderName = path.join(dataDir, teams[i].name);
    if (!fs.existsSync(teamFolderName)) {
      fs.mkdirSync(teamFolderName);
    }

    for (let j = 0; j < teams[i].matches.length; j++) {
      let match = teams[i].matches[j];
      createMatchScoreCardPdf(teamFolderName, teams[i].name, match);
    }
  }
}

function createMatchScoreCardPdf(teamFolderName, homeTeam, match) {
  let matchFileName = path.join(teamFolderName, match.vs);

  let templateFileBytes = fs.readFileSync("template.pdf");
  let pdfDocPromise = pdf.PDFDocument.load(templateFileBytes);
  pdfDocPromise.then(function (doc) {
    let page = doc.getPage(0);
    page.drawText(homeTeam, { x: 320, y: 620, size: 8 });
    page.drawText(match.vs, { x: 320, y: 600, size: 8 });
    page.drawText(match.selfScore, { x: 320, y: 590, size: 8 });
    page.drawText(match.oppScore, { x: 320, y: 575, size: 8 });
    page.drawText(match.result, { x: 320, y: 555, size: 8 });

    let changedBytesPromise = doc.save();
    changedBytesPromise.then(function (changedBytes) {
      if (fs.existsSync(matchFileName + ".pdf"))
        fs.writeFileSync(matchFileName + "1.pdf", changedBytes);
      else fs.writeFileSync(matchFileName + ".pdf", changedBytes);
    });
  });
}
