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

class FileChecker {
  constructor(filename){
    this.filename = filename
    this.exists = false
    if(fs.existsSync(filename)){
      this.exists = fs.statSync(filename).isFile()
    }
  }
}

// cli options and description
const optionDefinitions = [
  {
    name: 'help',
    description: 'Display the usage information.',
    alias: 'h',
    type: Boolean
  },
  {
    name: 'input',
    alias: 'i',
    description: 'The input logfile to process.',
    type: filename => new FileChecker(filename),
    multiple: false,
    defaultOption: true,
    typeLabel: '{underline file}'
  },
  {
    name: 'numbins',
    alias: 'n',
    description: 'Number of measurement bins for TOTAL latency computation.',
    type: Number,
    multiple: false,
    defaultValue: 300
  },
  {
    name: 'begin',
    alias: 'b',
    description: 'Lower bound of time to consider for measurements. <0 means start from the beginning.',
    type: Number,
    multiple: false,
    defaultValue: -1
  },
  {
    name: 'end',
    alias: 'e',
    description: 'Upper bound of time to consider for measurements. <0 means consider values till the EOF.',
    type: Number,
    multiple: false,
    defaultValue: -1
  },
  {
    name: 'top',
    alias: 't',
    description: 'Y-axiss (latency) limit. <0 means automatic.',
    type: Number,
    multiple: false,
    defaultValue: -1
  },
  {
    name: 'maxplots',
    alias: 'm',
    description: 'Sometimes we might have to many elements in the pipeline. This option allows us to plot only the N most important latency contributors.',
    type: Number,
    multiple: false,
    defaultValue: -1
  }
]
const cliDescription = [
  {
    header: 'GStreamer Logfile latency plotter app',
    content: 'This app plotts the latency of each element of gstramer pipeline. \n\
              Call your app using following parameters:\n\n\
              GST_DEBUG_COLOR_MODE=off GST_TRACERS="latency(flags=pipeline+element)" GST_DEBUG=GST_TRACER:7 GST_DEBUG_FILE=<yourTracefile> <YourApp>'
  },
  {
    header: 'Options',
    optionList: optionDefinitions
  },
  {
    content: 'Project home: {underline https://github.com/podborski/GStreamerLatencyPlotter}'
  }
]

const usage = commandLineUsage(cliDescription)
const options = commandLineArgs(optionDefinitions)

// check if options are ok
if(!options.input || options.help){
  console.log(usage)
  process.exit()
} else if(!options.input.exists) {
  console.warn('"' + options.input.filename + '" is not a valid file!')
  process.exit()
}

const rl = readline.createInterface({
  input: fs.createReadStream(options.input.filename)
})

let pipeLineElements = {}

rl.on('line', function(line){
  let elements = line.split(/\s+/)

  if(elements.length < 7) return
  if(elements[4] != "GST_TRACER") return
  if(elements[6] != "element-latency,") return

  if(elements.length != 12) return // our latency lines have always 12 columns

  // get name, timestamp and latency
  let name = elements[8].substring(16, elements[8].length-1) // element=(string)=16
  let time = parseInt(elements[10].substring(14, elements[10].length-1)) // time=(guint64)=14
  let latency = ((time < 0x8000000000000000)? time: (time - 0xffffffffffffffff - 1)) / 1000000
  let ts = parseInt(elements[11].substring(12, elements[11].length-1)) / 1000000000 // ts=(guint64)=12

  if(ts < options.begin && options.begin > 0) return
  if(ts > options.end && options.end > 0) return

  if(!(name in pipeLineElements)){
    pipeLineElements[name] = {}
    pipeLineElements[name].type = 'scatter'
    pipeLineElements[name].mode = 'lines'
    // pipeLineElements[name].line = {color: '#17BECF'}
    pipeLineElements[name].name = name
    pipeLineElements[name].x = [ts]
    pipeLineElements[name].y = [latency]
  }
  else {
    pipeLineElements[name].x.push(ts)
    pipeLineElements[name].y.push(latency)
  }
})

function plotData(){
  let layout = {
    title: 'Latency per element',
    xaxis: {
      title: "Time [s]"
    },
    yaxis: {
      title: "Latency [ms]"
    }
  }
  if(options.top>0) {
    layout.yaxis.range = [0, options.top]
  }

  // sort all elements by their mean latency value
  let sortedElements = Object.keys(pipeLineElements).map(function(key){
    return [key, pipeLineElements[key]]
  })
  sortedElements.sort(function(first, second) {
    return second[1]['userdata']['mean'] - first[1]['userdata']['mean']
  })
  // filter the desired number of plots
  if(options.maxplots > 0) {
    sortedElements = sortedElements.slice(0, options.maxplots)
  }
  // prepare data for plotting and finaly plot
  let data = []
  for(let i=0; i<sortedElements.length; ++i){
    data.push(sortedElements[i][1])
  }
  plotlib.plot(data, layout)
}

function computeSumPlot(numBins){
  let xes = []
  let yes = []
  let indexes = []
  let minTs = null
  let maxTs = null

  let tableData = [['median', 'mean', 'stdev', 'var', 'element']]
  for(let key in pipeLineElements){
    xes.push(pipeLineElements[key].x)
    yes.push(pipeLineElements[key].y)

    let median = stats.median(pipeLineElements[key].y)
    let mean = stats.mean(pipeLineElements[key].y)
    let variance = stats.variance(pipeLineElements[key].y)
    let stdev = stats.stdev(pipeLineElements[key].y)
    
    tableData.push([median, mean, stdev, variance, key])

    indexes.push(0)
    if(minTs == null || minTs>pipeLineElements[key].x[0]) minTs = pipeLineElements[key].x[0]
    if(maxTs == null || maxTs<pipeLineElements[key].x[pipeLineElements[key].x.length-1]) maxTs = pipeLineElements[key].x[pipeLineElements[key].x.length-1]

    // add some userdata average and std deviation which can be used later to filter reasonable plots
    pipeLineElements[key].userdata = {mean: mean, stdev: stdev}
  }

  // add plot data for TOTAL
  pipeLineElements['total'] = {}
  pipeLineElements['total'].type = 'scatter'
  pipeLineElements['total'].mode = 'lines'
  pipeLineElements['total'].line = {color: '#FF0000'}
  pipeLineElements['total'].name = 'total'
  pipeLineElements['total'].x = []
  pipeLineElements['total'].y = []

  let dt = (maxTs-minTs)/numBins

  for(let n=0; n<=numBins; n++){
    let ts = minTs + dt*n
    let sumVal = 0

    for(let i=0; i<xes.length; i++){
      let startIdx = indexes[i]
      let xArray = xes[i]

      do {
        let x = xArray[startIdx]
        let dif = Math.abs(ts - x)
        let nextdif = Math.abs(ts - xArray[startIdx+1])
        if(nextdif<dif){
          startIdx++
        } else{
          indexes[i] = startIdx
          if(dif < ts) sumVal += yes[i][startIdx]
          break
        }
      }while(true)
    }

    pipeLineElements['total'].x.push(ts)
    pipeLineElements['total'].y.push(sumVal)
  }

  let median = stats.median(pipeLineElements['total'].y)
  let mean = stats.mean(pipeLineElements['total'].y)
  let variance = stats.variance(pipeLineElements['total'].y)
  let stdev = stats.stdev(pipeLineElements['total'].y)
  pipeLineElements['total'].userdata = {mean: mean, stdev: stdev}
  tableData.push([median, mean, stdev, variance, 'TOTAL'])

  console.log(table.table(tableData))
}

rl.on('close', function(){
  computeSumPlot(options.numbins)
  plotData()
})
