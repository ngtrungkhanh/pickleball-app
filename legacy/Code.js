function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

var APP_READ_ONLY_REQUEST_ = false;

function isReadOnlyMode_(mode) {
  mode = String(mode || "").toLowerCase().trim();
  return mode === "read" || mode === "readonly" || mode === "view";
}

function setReadOnlyRequest_(readOnly) {
  if (readOnly === true) APP_READ_ONLY_REQUEST_ = true;
  if (readOnly === false) APP_READ_ONLY_REQUEST_ = false;
}

function isReadOnlyRequest_() {
  return APP_READ_ONLY_REQUEST_ === true;
}

function assertWritableRequest_() {
  if (isReadOnlyRequest_()) {
    throw new Error("Link này chỉ xem dữ liệu, không thể chỉnh sửa.");
  }
}

function includeOptional(filename) {
  try {
    return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
  } catch (e) {
    console.warn("Optional include skipped:", filename, e);
    return "<!-- optional include skipped: " + String(filename).replace(/[^a-zA-Z0-9_-]/g, "") + " -->";
  }
}

function doGet(e) {
  const readOnly = isReadOnlyMode_(e && e.parameter && e.parameter.mode);
  setReadOnlyRequest_(readOnly);
  if (!readOnly) ensureDatabase();

  const template = HtmlService.createTemplateFromFile('index');
  template.appMode = readOnly ? "view" : "edit";

  return template
    .evaluate()
    .setTitle('Pickleball Ranking');
}

function ensureDatabase() {
  if (isReadOnlyRequest_()) return ensureReadDatabase_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let players = ss.getSheetByName("PLAYERS");
  if (!players) players = ss.insertSheet("PLAYERS");
  players.getRange(1, 1, 1, 3).setValues([["player_id", "name", "active"]]);

  let matches = ss.getSheetByName("MATCHES");
  if (!matches) matches = ss.insertSheet("MATCHES");
  matches.getRange(1, 1, 1, 9).setValues([[
    "match_id", "date", "win_1", "win_2", "lose_1", "lose_2", "win_score", "lose_score", "season"
  ]]);

  let deleted = ss.getSheetByName("MATCHES_DELETED");
  if (!deleted) deleted = ss.insertSheet("MATCHES_DELETED");
  deleted.getRange(1, 1, 1, 13).setValues([[
    "match_id", "date", "win_1", "win_2", "lose_1", "lose_2", "win_score", "lose_score", "season",
    "deleted_at", "deleted_by", "delete_reason", "restored"
  ]]);
  
  let settings = ss.getSheetByName("SETTINGS");
  if (!settings) settings = ss.insertSheet("SETTINGS");
  settings.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
  if (!getSettingRaw("lose_money")) setSettingValue("lose_money", 5000);

  let config = ss.getSheetByName("CONFIG");
  if (!config) config = ss.insertSheet("CONFIG");
  config.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
  if (!getConfigValueRaw("app_name")) setConfigValue("app_name", "Pickleball Ranking");
  if (!getConfigValueRaw("current_season")) setConfigValue("current_season", "Season 1");

  let log = ss.getSheetByName("LOG");
  if (!log) log = ss.insertSheet("LOG");
  log.getRange(1, 1, 1, 2).setValues([["key", "value"]]);

  migrateLogVersions_();
}

function ensureReadDatabase_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    players: ss.getSheetByName("PLAYERS"),
    matches: ss.getSheetByName("MATCHES"),
    deleted: ss.getSheetByName("MATCHES_DELETED"),
    settings: ss.getSheetByName("SETTINGS"),
    config: ss.getSheetByName("CONFIG"),
    log: ss.getSheetByName("LOG")
  };
}

function ensureMatchActionDatabase_() {
  assertWritableRequest_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let matches = ss.getSheetByName("MATCHES");
  if (!matches) matches = ss.insertSheet("MATCHES");
  if (String(matches.getRange(1, 1).getValue() || "").trim() !== "match_id") {
    matches.getRange(1, 1, 1, 9).setValues([[
      "match_id", "date", "win_1", "win_2", "lose_1", "lose_2", "win_score", "lose_score", "season"
    ]]);
  }

  let config = ss.getSheetByName("CONFIG");
  if (!config) config = ss.insertSheet("CONFIG");
  if (String(config.getRange(1, 1).getValue() || "").trim() !== "key") {
    config.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
  }
  if (!getConfigValueRaw("current_season")) setConfigValue("current_season", "Season 1");

  ensureLogSheet_();

  return {
    ss: ss,
    matches: matches,
    currentSeason: String(getConfigValueRaw("current_season") || "Season 1").trim()
  };
}

function ensureLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName("LOG");
  if (isReadOnlyRequest_()) return log;

  if (!log) {
    log = ss.insertSheet("LOG");
    log.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
    return log;
  }

  const keyHeader = String(log.getRange(1, 1).getValue() || "").trim();
  const valueHeader = String(log.getRange(1, 2).getValue() || "").trim();
  if (keyHeader !== "key" || valueHeader !== "value") {
    log.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
  }

  return log;
}

function migrateLogVersions_() {
  if (isReadOnlyRequest_()) return;

  const logMap = readLogMap_();
  const t = String(Date.now());
  const keys = [
    "last_updated",
    "global_version",
    "matches_version",
    "players_version",
    "settings_version",
    "config_version",
    "seasons_version"
  ];

  keys.forEach(function(key) {
    if (!logMap[key]) {
      setLogValue(key, t);
      logMap[key] = t;
    }
  });

  if (!logMap.last_action) setLogValue("last_action", "init");
}

/* LOG */
function readLogMap_() {
  ensureLogSheet_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("LOG");
  const map = {};

  if (!sh || sh.getLastRow() < 2) return map;

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();

  data.forEach(function(row) {
    const key = String(row[0] || "").trim();
    if (key) map[key] = row[1];
  });

  return map;
}

function getLogValueRaw(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("LOG");
  if (!sh || sh.getLastRow() < 2) return "";

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return data[i][1];
  }

  return "";
}

function setLogValue(key, value) {
  assertWritableRequest_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("LOG");

  const data = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    : [];

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      sh.getRange(i + 2, 2).setValue(value);
      return true;
    }
  }

  sh.appendRow([key, value]);
  return true;
}

function touchLog(action, parts) {
  assertWritableRequest_();

  const t = String(Date.now());
  setLogValue("last_updated", t);
  setLogValue("global_version", t);
  setLogValue("last_action", action || "update");

  const changed = Array.isArray(parts) && parts.length ? parts : ["matches", "players", "settings", "config", "seasons"];
  changed.forEach(function(part) {
    if (part === "matches") setLogValue("matches_version", t);
    if (part === "players") setLogValue("players_version", t);
    if (part === "settings") setLogValue("settings_version", t);
    if (part === "config") setLogValue("config_version", t);
    if (part === "seasons") setLogValue("seasons_version", t);
  });

  const logMap = readLogMap_();

  return {
    lastUpdated: t,
    lastAction: action || "update",
    globalVersion: t,
    matchesVersion: String(logMap.matches_version || t),
    playersVersion: String(logMap.players_version || t),
    settingsVersion: String(logMap.settings_version || t),
    configVersion: String(logMap.config_version || t),
    seasonsVersion: String(logMap.seasons_version || t)
  };
}

function getLogInfoLite(readOnly) {
  setReadOnlyRequest_(readOnly === true);

  migrateLogVersions_();
  const logMap = readLogMap_();
  const lastUpdated = String(logMap.last_updated || "");

  return {
    lastUpdated: lastUpdated,
    lastAction: String(logMap.last_action || ""),
    globalVersion: String(logMap.global_version || lastUpdated)
  };
}

function getLogInfo(readOnly) {
  setReadOnlyRequest_(readOnly === true);

  migrateLogVersions_();
  const logMap = readLogMap_();
  const lastUpdated = String(logMap.last_updated || "");
  const globalVersion = String(logMap.global_version || lastUpdated);

  return {
    lastUpdated: lastUpdated,
    lastAction: String(logMap.last_action || ""),
    globalVersion: globalVersion,
    matchesVersion: String(logMap.matches_version || globalVersion),
    playersVersion: String(logMap.players_version || globalVersion),
    settingsVersion: String(logMap.settings_version || globalVersion),
    configVersion: String(logMap.config_version || globalVersion),
    seasonsVersion: String(logMap.seasons_version || globalVersion),
    dataVersion: globalVersion
  };
}

function buildDataVersion() {
  return String(getLogInfo().globalVersion || "");
}

function buildSheetVersion_(ss, sheetName, colCount) {
  return String(sheetName || "") + ":versioned-by-log";
}

/* CONFIG / SETTINGS */
function getConfigValueRaw(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("CONFIG");
  if (!sh || sh.getLastRow() < 2) return "";

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return data[i][1];
  }

  return "";
}

function getConfigValue(key, defaultValue) {
  ensureDatabase();
  return getConfigValueRaw(key) || defaultValue;
}

function setConfigValue(key, value) {
  assertWritableRequest_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("CONFIG");

  const data = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    : [];

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      sh.getRange(i + 2, 2).setValue(value);
      return true;
    }
  }

  sh.appendRow([key, value]);
  return true;
}

function getSettingRaw(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("SETTINGS");
  if (!sh || sh.getLastRow() < 2) return "";

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return data[i][1];
  }

  return "";
}

function setSettingValue(key, value) {
  assertWritableRequest_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("SETTINGS");

  const data = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    : [];

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      sh.getRange(i + 2, 2).setValue(value);
      return true;
    }
  }

  sh.appendRow([key, value]);
  return true;
}

function getCurrentSeason() {
  return String(getConfigValue("current_season", "Season 1")).trim();
}

function getLoseMoney() {
  ensureDatabase();
  return Number(getSettingRaw("lose_money")) || 5000;
}

/* SEASON */
function getSeasonNumber(seasonName) {
  const n = Number(String(seasonName).replace(/\D/g, ""));
  return n || 1;
}

function getSeasons() {
  ensureDatabase();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("MATCHES");
  const current = getCurrentSeason();

  let seasons = new Set();
  seasons.add(current);

  if (sh && sh.getLastRow() > 1) {
    const values = sh.getRange(2, 9, sh.getLastRow() - 1, 1).getValues();
    values.forEach(r => {
      if (r[0]) seasons.add(String(r[0]).trim());
    });
  }

  return Array.from(seasons).sort((a, b) => getSeasonNumber(b) - getSeasonNumber(a));
}

function getNextSeasonName() {
  const seasons = getSeasons();
  let max = 1;

  seasons.forEach(s => {
    max = Math.max(max, getSeasonNumber(s));
  });

  return "Season " + (max + 1);
}

function endCurrentSeason() {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  const nextSeason = getNextSeasonName();
  setConfigValue("current_season", nextSeason);
  touchLog("end_season", ["config", "seasons"]);
  return getDataParts(["config", "seasons"]);
}

function setCurrentSeason(seasonName) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  if (!seasonName) throw new Error("Tên season không hợp lệ.");
  setConfigValue("current_season", String(seasonName).trim());
  touchLog("set_current_season", ["config", "seasons"]);
  return getDataParts(["config", "seasons"]);
}

function renameSeason(oldName, newName) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  oldName = String(oldName || "").trim();
  newName = String(newName || "").trim();

  if (!oldName || !newName) throw new Error("Tên season không hợp lệ.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("MATCHES");

  if (sh && sh.getLastRow() > 1) {
    const range = sh.getRange(2, 9, sh.getLastRow() - 1, 1);
    const values = range.getValues();

    range.setValues(values.map(r => [
      String(r[0]).trim() === oldName ? newName : r[0]
    ]));
  }

  if (getCurrentSeason() === oldName) {
    setConfigValue("current_season", newName);
  }

  touchLog("rename_season", ["matches", "config", "seasons"]);
  return getDataParts(["matches", "config", "seasons"]);
}

function deleteSeason(seasonName) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  seasonName = String(seasonName || "").trim();
  if (!seasonName) throw new Error("Tên season không hợp lệ.");

  const currentSeason = getCurrentSeason();
  const isDeletingCurrent = seasonName === currentSeason;

  let fallbackSeason = "Season 1";

  if (isDeletingCurrent) {
    const seasons = getSeasons().filter(s => s !== seasonName);
    const deletedNumber = getSeasonNumber(seasonName);

    const previousSeasons = seasons
      .filter(s => getSeasonNumber(s) < deletedNumber)
      .sort((a, b) => getSeasonNumber(b) - getSeasonNumber(a));

    if (previousSeasons.length > 0) {
      fallbackSeason = previousSeasons[0];
    } else if (seasons.length > 0) {
      fallbackSeason = seasons[0];
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("MATCHES");
  const deletedSh = ss.getSheetByName("MATCHES_DELETED") || ss.insertSheet("MATCHES_DELETED");

  deletedSh.getRange(1, 1, 1, 13).setValues([[
    "match_id", "date", "win_1", "win_2", "lose_1", "lose_2", "win_score", "lose_score", "season",
    "deleted_at", "deleted_by", "delete_reason", "restored"
  ]]);

  const deletedAt = new Date();
  const deletedBy = Session.getActiveUser().getEmail() || "unknown";

  if (sh && sh.getLastRow() > 1) {
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();

    for (let i = data.length - 1; i >= 0; i--) {
      const rowSeason = data[i][8] ? String(data[i][8]).trim() : "Season 1";

      if (rowSeason === seasonName) {
        deletedSh.appendRow([
          data[i][0],
          data[i][1],
          data[i][2],
          data[i][3],
          data[i][4],
          data[i][5],
          data[i][6],
          data[i][7],
          rowSeason,
          deletedAt,
          deletedBy,
          "delete_season",
          false
        ]);

        sh.deleteRow(i + 2);
      }
    }
  }

  if (isDeletingCurrent) {
    setConfigValue("current_season", fallbackSeason);
  }

  touchLog("delete_season", ["matches", "config", "seasons"]);
  return getDataParts(["matches", "config", "seasons"]);
}

function getDeletedSeasons() {
  ensureDatabase();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("MATCHES_DELETED");

  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getDisplayValues();
  const map = {};

  data.forEach(r => {
    const season = String(r[8] || "").trim();
    const restoredText = String(r[12] || "").trim().toUpperCase();

    const restored = restoredText === "TRUE" || restoredText === "ĐÃ KHÔI PHỤC";

    if (!season || restored) return;

    if (!map[season]) {
      map[season] = {
        season: season,
        count: 0,
        deletedAt: String(r[9] || "")
      };
    }

    map[season].count++;
  });

  return Object.values(map).sort((a, b) => getSeasonNumber(b.season) - getSeasonNumber(a.season));
}

function getRestoreSeasonName(originalSeason) {
  const existing = getSeasons();
  originalSeason = String(originalSeason || "").trim();

  if (!existing.includes(originalSeason)) {
    return originalSeason;
  }

  let base = originalSeason + "_bak";
  let name = base;
  let i = 2;

  while (existing.includes(name)) {
    name = base + i;
    i++;
  }

  return name;
}

function restoreDeletedSeason(seasonName) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  ensureDatabase();

  seasonName = String(seasonName || "").trim();
  if (!seasonName) throw new Error("Tên season không hợp lệ.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deletedSh = ss.getSheetByName("MATCHES_DELETED");
  const matchesSh = ss.getSheetByName("MATCHES");

  if (!deletedSh || deletedSh.getLastRow() < 2) {
    throw new Error("Không có dữ liệu đã xóa để khôi phục.");
  }

  const restoreSeasonName = getRestoreSeasonName(seasonName);

  const rawData = deletedSh.getRange(2, 1, deletedSh.getLastRow() - 1, 13).getValues();
  const displayData = deletedSh.getRange(2, 1, deletedSh.getLastRow() - 1, 13).getDisplayValues();

  let restoredCount = 0;

  for (let i = 0; i < displayData.length; i++) {
    const rowSeason = String(displayData[i][8] || "").trim();
    const restoredText = String(displayData[i][12] || "").trim().toUpperCase();

    const restored = restoredText === "TRUE" || restoredText === "ĐÃ KHÔI PHỤC";

    if (rowSeason === seasonName && !restored) {
      matchesSh.appendRow([
        "M" + Date.now() + "_" + i,
        rawData[i][1],
        rawData[i][2],
        rawData[i][3],
        rawData[i][4],
        rawData[i][5],
        rawData[i][6],
        rawData[i][7],
        restoreSeasonName
      ]);

      deletedSh.getRange(i + 2, 13).setValue(true);
      restoredCount++;
    }
  }

  if (restoredCount === 0) {
    throw new Error("Season này không còn trận nào để khôi phục. Có thể season này đã được máy khác khôi phục trước đó.");
  }

  setConfigValue("current_season", restoreSeasonName);
  touchLog("restore_season", ["matches", "config", "seasons"]);

  const appData = getDataParts(["matches", "config", "seasons"]);
  appData.restoredSeason = restoreSeasonName;
  appData.restoredCount = restoredCount;
  appData.originalSeason = seasonName;
  appData.deletedSeasons = getDeletedSeasons();

  return appData;
}

/* PLAYERS */
function getPlayers() {
  ensureDatabase();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("PLAYERS");
  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();

  return data
    .filter(r => r[0] && r[1])
    .map(r => ({
      id: String(r[0]).trim(),
      name: String(r[1]).trim(),
      active: r[2] === true || String(r[2]).toUpperCase() === "TRUE"
    }));
}

function getActivePlayers() {
  return getPlayers().filter(p => p.active);
}

function generatePlayerId() {
  const players = getPlayers();
  let max = 0;

  players.forEach(p => {
    const n = Number(String(p.id).replace(/\D/g, ""));
    if (n > max) max = n;
  });

  return "P" + String(max + 1).padStart(3, "0");
}

function addPlayer(name) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  name = String(name || "").trim();
  if (!name) throw new Error("Tên người chơi không được để trống.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("PLAYERS");

  sh.appendRow([generatePlayerId(), name, true]);

  touchLog("add_player", ["players"]);
  return getDataParts(["players"]);
}

function updatePlayer(playerId, name, active) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  playerId = String(playerId || "").trim();
  name = String(name || "").trim();

  if (!playerId) throw new Error("Thiếu mã người chơi.");
  if (!name) throw new Error("Tên người chơi không được để trống.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("PLAYERS");

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === playerId) {
      sh.getRange(i + 2, 2).setValue(name);
      sh.getRange(i + 2, 3).setValue(active === true || String(active).toUpperCase() === "TRUE");
      touchLog("update_player", ["players", "matches"]);
      return getDataParts(["players", "matches"]);
    }
  }

  throw new Error("Không tìm thấy người chơi.");
}

/* MATCH DATA */
function getPlayerNameMap() {
  const map = {};
  getPlayers().forEach(p => {
    map[p.id] = p.name;
  });
  return map;
}

function formatMatchRow(r, nameMap) {
  const rawDate = r[1] ? new Date(r[1]) : new Date();
  const season = r[8] ? String(r[8]).trim() : "Season 1";

  return {
    matchId: String(r[0]).trim(),
    dateValue: rawDate.getTime(),
    date: Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"),
    win1: String(r[2]).trim(),
    win2: String(r[3]).trim(),
    lose1: String(r[4]).trim(),
    lose2: String(r[5]).trim(),
    win1Name: nameMap[String(r[2]).trim()] || String(r[2]).trim(),
    win2Name: nameMap[String(r[3]).trim()] || String(r[3]).trim(),
    lose1Name: nameMap[String(r[4]).trim()] || String(r[4]).trim(),
    lose2Name: nameMap[String(r[5]).trim()] || String(r[5]).trim(),
    winScore: Number(r[6]) || 0,
    loseScore: Number(r[7]) || 0,
    season: season,
    synced: true
  };
}

function formatMatchRowLite(r) {
  const rawDate = r[1] ? new Date(r[1]) : new Date();
  const season = r[8] ? String(r[8]).trim() : "Season 1";

  return {
    matchId: String(r[0]).trim(),
    dateValue: rawDate.getTime(),
    date: Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"),
    win1: String(r[2]).trim(),
    win2: String(r[3]).trim(),
    lose1: String(r[4]).trim(),
    lose2: String(r[5]).trim(),
    winScore: Number(r[6]) || 0,
    loseScore: Number(r[7]) || 0,
    season: season,
    synced: true
  };
}

function getAllMatches() {
  ensureDatabase();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("MATCHES");
  const nameMap = getPlayerNameMap();

  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();

  return data
    .filter(r => String(r[0]).trim() !== "" && String(r[0]).trim() !== "match_id")
    .map(r => formatMatchRow(r, nameMap))
    .sort((a, b) => b.dateValue - a.dateValue);
}

function getAppData(readOnly) {
  setReadOnlyRequest_(readOnly === true);

  const log = getLogInfo();

  return {
    appName: String(getConfigValue("app_name", "Pickleball Ranking")),
    currentSeason: getCurrentSeason(),
    seasons: getSeasons(),
    players: getActivePlayers(),
    allPlayers: getPlayers(),
    matches: getAllMatches(),
    loseMoney: getLoseMoney(),
    log: log
  };
}

function getDataParts(parts, readOnly) {
  setReadOnlyRequest_(readOnly === true);

  parts = Array.isArray(parts) ? parts : [];
  const partSet = {};
  parts.forEach(function(part) {
    partSet[String(part)] = true;
  });

  if (partSet.matches || partSet.players || partSet.seasons || partSet.config || partSet.settings) {
    ensureDatabase();
  } else {
    ensureLogSheet_();
  }

  const data = {
    partial: true,
    parts: parts,
    log: getLogInfo()
  };

  if (partSet.config) {
    data.appName = String(getConfigValue("app_name", "Pickleball Ranking"));
    data.currentSeason = getCurrentSeason();
  }

  if (partSet.seasons) {
    data.currentSeason = getCurrentSeason();
    data.seasons = getSeasons();
  }

  if (partSet.players) {
    data.players = getActivePlayers();
    data.allPlayers = getPlayers();
  }

  if (partSet.matches) {
    data.matches = getAllMatches();
  }

  if (partSet.settings) {
    data.loseMoney = getLoseMoney();
  }

  return data;
}

function addMatch(data) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  const db = ensureMatchActionDatabase_();
  const sh = db.matches;

  const players = [data.win1, data.win2, data.lose1, data.lose2].map(x => String(x).trim());

  if (players.includes("")) throw new Error("Chưa chọn đủ 4 người chơi.");
  if (new Set(players).size < 4) throw new Error("Một người không được chọn trùng trong cùng trận.");

  const clientTempId = String(data.tempId || "");
  const season = db.currentSeason;

  const lastRowNumber = sh.getLastRow();
  if (lastRowNumber > 1) {
    const startRow = Math.max(2, lastRowNumber - 2);
    const recentRows = sh.getRange(startRow, 1, lastRowNumber - startRow + 1, 9).getValues();

    for (let i = recentRows.length - 1; i >= 0; i--) {
      if (!isSameRecentMatch(recentRows[i], players, season)) continue;
      const log = getLogInfo();

      return {
        tempId: clientTempId,
        match: formatMatchRowLite(recentRows[i]),
        currentSeason: season,
        log: log,
        duplicated: true
      };
    }
  }

  const matchId = "M" + new Date().getTime();
  const now = new Date();

  const row = [
    matchId,
    now,
    players[0],
    players[1],
    players[2],
    players[3],
    Number(data.winScore) || 0,
    Number(data.loseScore) || 0,
    season
  ];

  sh.appendRow(row);

  const log = touchLog("add_match", ["matches"]);

  return {
    tempId: clientTempId,
    match: formatMatchRowLite(row),
    currentSeason: season,
    log: log,
    duplicated: false
  };
}

function deleteMatch(matchId) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  const db = ensureMatchActionDatabase_();
  const sh = db.matches;
  const season = db.currentSeason;

  if (!sh || sh.getLastRow() < 2) {
      const log = touchLog("delete_match_already_missing", ["matches", "seasons"]);

    return {
      deletedMatchId: String(matchId),
      currentSeason: season,
      log: log,
      alreadyDeleted: true
    };
  }

  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(matchId)) {
      sh.deleteRow(i + 2);

      const log = touchLog("delete_match", ["matches", "seasons"]);

      return {
        deletedMatchId: String(matchId),
        currentSeason: season,
        log: log,
        alreadyDeleted: false
      };
    }
  }

  const log = touchLog("delete_match_already_missing", ["matches", "seasons"]);

  return {
    deletedMatchId: String(matchId),
    currentSeason: season,
    log: log,
    alreadyDeleted: true
  };
}

/* MONEY */
function updateLoseMoney(value) {
  setReadOnlyRequest_(false);
  assertWritableRequest_();

  const money = Number(value);

  if (!money || money < 0) {
    throw new Error("Mức tiền phạt không hợp lệ.");
  }

  setSettingValue("lose_money", money);
  touchLog("update_lose_money", ["settings"]);

  return getDataParts(["settings"]);
}

function normalizeTeam(a, b) {
  return [String(a).trim(), String(b).trim()].sort().join("|");
}

function isSameRecentMatch(lastRow, newPlayers, season) {
  if (!lastRow || lastRow.length < 9) return false;

  const lastDate = lastRow[1] ? new Date(lastRow[1]) : null;
  if (!lastDate) return false;

  const now = new Date();
  const diffMinutes = Math.abs(now.getTime() - lastDate.getTime()) / 60000;

  if (diffMinutes > 15) return false;

  const lastSeason = lastRow[8] ? String(lastRow[8]).trim() : "Season 1";
  if (lastSeason !== season) return false;

  const lastWinTeam = normalizeTeam(lastRow[2], lastRow[3]);
  const lastLoseTeam = normalizeTeam(lastRow[4], lastRow[5]);

  const newWinTeam = normalizeTeam(newPlayers[0], newPlayers[1]);
  const newLoseTeam = normalizeTeam(newPlayers[2], newPlayers[3]);

  return lastWinTeam === newWinTeam && lastLoseTeam === newLoseTeam;
}
