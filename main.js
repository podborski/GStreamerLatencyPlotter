// File: main.js
// Project: GStreamerLatencyPlotter
// File Created: Friday, 17th January 2020
// Author(s): podborski 
// 

const plotlib = require('nodeplotlib')
const fs = require('fs')
const readline = require('readline')
const commandLineArgs = require('command-line-args')
const commandLineUsage = require('command-line-usage')
const stats = require("stats-lite")
const table = require("table")

// todo