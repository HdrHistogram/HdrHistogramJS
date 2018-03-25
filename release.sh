#!/bin/bash
rm -Rf release
mkdir release
cp README.md release/README.md
cp -R node_modules release/node_modules
cp -R src release/src
cp *.json release/
cp webpack.config.js release/webpack.config.js
cd release
yarn prepare-publish
