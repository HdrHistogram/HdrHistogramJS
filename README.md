[![Build Status](https://travis-ci.org/HdrHistogram/HdrHistogramJS.svg?branch=master)](https://travis-ci.org/HdrHistogram/HdrHistogramJS)

# HdrHistogramJS
Browser port of HdrHistogram entirely written in TypeScript!  
See HdrHistogramJS live in action in your browser with this [simple demo](https://hdrhistogram.github.io/HdrHistogramJSDemo/ping-demo.html) or [this one](https://hdrhistogram.github.io/HdrHistogramJSDemo/decoding-demo.html)   
These demos are coded in good old JavaScript. This may sound obvious but you can use HdrHistogramJS whatever the JS flavor you are into ;)  
Obviously, due to JavaScript limitations, performances will not be as good as with the original version. A few micro seconds might be needed to record a value, but you 
should [check this out for yourself](https://hdrhistogram.github.io/HdrHistogramJSDemo/hdr-on-hdr.html)    
This is a work in progress so do not hesitate to give feedback, using github issues or twitter (DM @Alex_Victoor)

# Dataviz
HdrHistogramJS allows to display histograms without server-side processing. Hence, within your browser, you can:

- Display histograms with this slightly modified version of the [hdrhistogram plotter](https://hdrhistogram.github.io/HdrHistogramJSDemo/plotFiles.html). With this one you can use base64 v2 encoded histograms as inputs.  
- Analyze log files with this [log analyzer](https://hdrhistogram.github.io/HdrHistogramJSDemo/logparser.html), inspired from the original [java/swing based log analyzer](https://github.com/HdrHistogram/HistogramLogAnalyzer). 


# Getting started
This library is packaged as a UMD module, hence it can be used directly 
from JavaScript within a browser, as a commonjs / es6 JavaScript module 
or as a TypeScript module.  
Using npm you can get this lib with the following command:
```
  npm i hdr-histogram-js
```
Or if you like yarn better:
```
  yarn add hdr-histogram-js
```

Note for TypeScript developers: since HdrHistogramJS has been written in TypeScript, definition files are embedded, no additional task is needed to get them. 

The library is packaged as a UMD module, hence you can also directly use it from your browser. 
To do so, simply include a js file from github's release page:
```
<script src="https://github.com/HdrHistogram/HdrHistogramJS/releases/download/v1.1.0/hdrhistogram.min.js" />
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
Here is how to use it to instantiate a new histogram instance:
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
      bitBucketSize: 32,                // may be 8, 16, 32 or 64
      autoResize: true,                 // default value is true
      lowestDiscernibleValue: 1,        // default value is also 1
      highestTrackableValue: 2,         // can increase up to Number.MAX_SAFE_INTEGER
      numberOfSignificantValueDigits: 3 // Number between 1 and 5 (inclusive)
    }
  );

```

## Record values
Once you have an histogram instance, you just need 
to call recordValue(), as with the Java version, to record 
a single value:
```
histogram.recordValue(1234);
```
The number passed as a parameter is expected to be an integer. If it is not the case, the decimal part will be ignored.

A demo is available [online](https://hdrhistogram.github.io/HdrHistogramJSDemo/ping-demo.html)!   
Check out the HTML source, at the bottom of the page you will see a tiny chunk of JavaScript where an histogram is created and then used to 
record latency values.
A very [similar demo](https://hdrhistogram.github.io/HdrHistogramJSDemo/hdr-on-hdr.html) is also available where hdrhistogram is used on hdrhistogram in order to know how much time is needed to record values.   

## Dealing with coordinated omissions
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
import * as hdr from "hdr-histogram-js"

const h = hdr.build();
h.recordValue(123);
h.recordValue(122);
h.recordValue(1244);

console.log(h.minNonZeroValue);           // 122
console.log(h.maxValue);                  // 1244
console.log(h.getMean());                 // 486.333...
console.log(h.getValueAtPercentile(90));  // 1244 as well
```

As with the original Java version, you can also generate a textual
representation of an histogram:
```
import * as hdr from "hdr-histogram-js"

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
//  ...
//      75.000 0.700000000000          3           3.33
//      75.000 1.000000000000          3
//#[Mean    =       50.000, StdDeviation   =       20.412]
//#[Max     =       75.000, Total count    =            3]
//#[Buckets =           43, SubBuckets     =         2048]

```

## Encode & decode
You can encode and decode base64 compressed histograms. Hence you can decode base64 compressed histograms produced by other implementations of HdrHistogram (Java, C#, Rust, ...).  
The code fragment below shows how to encode an histogram:
```
import * as hdr from "hdr-histogram-js"

const histogram = hdr.build();
histogram.recordvalue(42);
const encodedString = hdr.encodeIntoBase64String(histogram); 
// gives something that looks like "HISTFAAAAB542pNpmSzMwMDAxAABzFCaEUoz2X+AMIKZAEARAtM="
``` 

Then to decode an histogram you can use this chunk of code:
```
import * as hdr from "hdr-histogram-js"

const encodedString = "HISTFAAAAB542pNpmSzMwMDAxAABzFCaEUoz2X+AMIKZAEARAtM=";
const histogram = hdr.decodeFromCompressedBase64(encodedString);
```

Note: right now only HdrHistogram V2 format is supported (the latest one). If you need support for older formats, do not hesitate to raise a github issue. 

If you want to use this feature along with the UMD package, you need to add external dependency 
"pako". "pako" is used for zlib compression. Using npm you should get
it as a transitive dependency, otherwise you need to add it in 
your html page.

You can check out [this demo](https://hdrhistogram.github.io/HdrHistogramJSDemo/decoding-demo.html) or this [plotter on steroid](https://hdrhistogram.github.io/HdrHistogramJSDemo/plotFiles.html) to see this feature live!  
*Be aware that only latest V2 encoding has been implemented, let me know if this is an issue for you*

## Histogram logs
HistogramLogWriter and HistogramLogReader classes have been migratedand the API isquite similar to the one you might have used with the Java version. 
Below a simple usage example of the HistogramLogWriter, where the log contents are appended to a string variable:
```
import * as hdr from "hdr-histogram-js"

let buffer: string;
const writer = new hdr.HistogramLogWriter(content => {
  buffer += content;
});
const histogram = hdr.build();
histogram.startTimeStampMsec = 1234001;
histogram.endTimeStampMsec   = 1235123;

...

histogram.recordValue(123000);

writer.outputLogFormatVersion();
writer.outputLegend();
writer.outputIntervalHistogram(histogram);
```

As for the reading part, if you know a little bit the Java version, the following code fragment will sound familiar:
```
const reader = new hdr.HistogramLogReader(fileContent);
let histogram;
while ((histogram = reader.nextIntervalHistogram()) != null) {
  // iterate on all histogram log lines 
  ...

}
```

# Tree Shaking
The above examples use a convenient 'barrel' index file. Using this barrel, you cannot leverage on the tree shaking features of your favorite bundler. Hence the size of your JavaScript bundle may increase significantly, mostly because of code related to encoding/decoding. If you do use any encoding/decoding features and you need to optimize the size of your bundle, you can import HdrHistogram modules as shown in code fragment below:

```
import Int32Histogram from "hdr-histogram-js/Int32Histogram"

const histogram = new Int32Histogram(1, 2, 3);
histogram.autoResize = true;

histogram.recordValue(...);

```

# Design & Limitations
The code is almost a direct port of the Java version.
Optimisation based on inheritance to avoid false sharing 
might not be relevant in JS, but I believe that keeping 
the same code structure might be handy to keep the code up to date 
with the Java version in the future.

Main limitations comes from number support in JavaScript. 
There is no such thing as 64b integers in JavaScript. Everything is "number", 
and a number is safe as an integer up to 2^53.  
The most annoying issue encountered during the code migration, 
is that bit operations, heavily used within original HdrHistogram, 
only work on the first 32 bits. That means that the following JavaScript expression is evaluated as true:
```
Math.pow(2, 31) << 1 === 0   // sad but true
```
Anyway bit shift operations are not really optimized 
in most browser, so... everything related to bits have been
converted to good old arithmetic expressions in the process
of converting the Java code to TypeScript. 

# Backlog
- publish benchmarks with alternatives (native-hdr-histogram & node-hdr-histogram)
- logarithmic iterator
- ... let me know what's on your mind :-)
