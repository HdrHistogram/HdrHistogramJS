[![Build Status](https://travis-ci.org/alexvictoor/HdrHistogramJS.svg?branch=master)](https://travis-ci.org/alexvictoor/HdrHistogramJS)

# HdrHistogramJS
Browser port of HdrHistogram entirely written in TypeScript!  
Of course you can use HdrHistogramJS whatever the JS flavor you are into ;)  
This is a work in progress so do not hesitate to give feedback using github issues or twitter (@Alex_Victoor)

# Getting started
This library is packaged as a UMD module, hence it can be used directly 
from JavaScript within a browser, as commonjs / es6 JavaScript module 
or as a TypeScript module.  
Using npm you can get this lib with the following command:
```
  npm i hdr-histogram-js
```
Note for TypeScript developers: since HdrHistogramJS has been written in TypeScript, definition files are embedded, no additional task is needed to get them. 

The library is packaged as a UMD module, hence you can also directly use if from the browser. 
To use it directly within a browser, simply include a js file from github's release page:
```
<script src="https://github.com/alexvictoor/HdrHistogramJS/releases/download/1.0.0.beta.2/hdrhistogram.min.js" />
```
Then you will have access to classes and functions of the APIs using "hdr" prefix.

# Features
All the features from HdrHistogram have not been (yet) ported to 
JavaScript, still the most important ones are already there:
- record latency using different bucket sizes
- resize historams
- correct coordinated omissions, at and after recording time
- generate histograms outputs, in plain text or csv
- add and substract histograms
- encode and decode compressed histograms

# API
The examples below use ES6 syntax. You can check out demo sources 
for examples on how to use HdrHistogram directly within a browser, you should 
not have any surprise though.  

## Instantiate an histogram
The API is very close to the original Java API, there is just 
a tiny addition, a simple builder function.
Here is how to use it to instantiate a new histogram object:
```
import * as hdr from "hdr-histogram-js"

const histogram = hdr.build(); 
```
You can be more specific using and optionnal build request parameter:
```
import * as hdr from "hdr-histogram-js"

const histogram 
  = hdr.build(
    { 
      bitBucketSize: 64,                // may be 8, 16, 32 or 64
      autoResize: true,                 // default value is true
      lowestDiscernibleValue: 1,        // default value is also 1
      highestTrackableValue: 2,         // can increase up to Number.MAX_SAFE_INTEGER
      numberOfSignificantValueDigits: 3 // Number between 1 and 5 inclusive
    }
  );

```
Then, once you have an histogram instance, you just need 
to call recordValue(), as with the Java version, to record 
a single number value:
```
histogram.recordValue(1234);
```

## Coordinated omissions
If you are recording values at a fixed rate, 
you can correct coordinated omissions while recording values:
```
histogram.recordValueWithExpectedInterval(1234, 100);
```
If you prefer to apply correction afterward:
```
const correctedHistogram 
  = histogram.copyCorrectedForCoordinatedOmission(100);
```

## Retrieve metrics
You can get min, max, median values and of course percentiles values as shown below:
```
const h = hdr.build();
h.recordValue(123);
h.recordValue(122);
h.recordValue(1244);

console.log(h.minNonZeroValue);           // 122
console.log(h.maxValue);                  // 1244
console.log(h.getMean());                 // 486.333...
console.log(h.getValueAtPercentile(90));  // 1244 as well
```

As with the original Java version, you can generate a textual
representation of an histogram:
```
const histogram = hdr.build();
histogram.recordValue(25);
histogram.recordValue(50);
histogram.recordValue(75);
const output = histogram.outputPercentileDistribution();

// output will be:
//
//       Value     Percentile TotalCount 1/(1-Percentile)
//
//      25.000 0.000000000000          1           1.00
//      25.000 0.100000000000          1           1.11
//      25.000 0.200000000000          1           1.25
//      25.000 0.300000000000          1           1.43
//      50.000 0.400000000000          2           1.67
//      50.000 0.500000000000          2           2.00
//      50.000 0.550000000000          2           2.22
//      50.000 0.600000000000          2           2.50
//      50.000 0.650000000000          2           2.86
//      75.000 0.700000000000          3           3.33
//      75.000 1.000000000000          3
//#[Mean    =       50.000, StdDeviation   =       20.412]
//#[Max     =       75.000, Total count    =            3]
//#[Buckets =           43, SubBuckets     =         2048]

```
HistogramLogReader & Writer classes have not been ported yet, 
but you can already encode and decode base64 compressed histograms:
```
import * as hdr from "hdr-histogram-js"

// only V2 encoding supported 
const encodedHistogram = "HISTFAAAAB542pNpmSzMwMDAxAABzFCaEUoz2X+AMIKZAEARAtM=";

const histogram = hdr.decodeFromCompressedBase64(base64String);

// get an histogram with a single recorded value, which is 42

```

If you want to use this feature you need to add external dependency 
"pako". "pako" is used for zlib compression. Using npm you should get
it as a transitive dependency, otherwise you need to add it in 
your html page.

# Design & Limitations
The code is almost a direct port of the Java version.
Optimisation based on inheritance to avoid false sharing 
might not be relevant in JS, but I believe that keeping 
the same structure might be handy to keep the code up to date.

Main limitations comes from number support in JavaScript. 
There is no such thing as 64b integers in JavaScript. Everything is "number", 
and a number is safe as an integer up to 2^53.  
The most annoying issue encountered during the code migration, 
is that bit operations, heavily used within HdrHistogram, 
only work on the first 32 bits. That means that the following expression is true:
```
Math.pow(2, 31) << 1 === 0   // sadly true
```
Anyway bit shift operations are not really optimized 
in most browser, so... everything related to bits have been
converted to good old arithmetic expressions

# Backlog
- Recorder class
- Log writer and log reader
- logarithmic iterator
- ... let me know what's on your mind :-)