#!/usr/bin/env node

'use strict';

const objc = require('../src/index');
const util = require('util');

const {
	NSDate,
	NSDateFormatter
} = objc;


let now = NSDate.date();
console.log('LOG DATE')
console.log('now:', now); // e.g. now: [objc: 2022-02-04 12:15:44 +0000]

// Convert the NSDate object to a JavaScript date
let asJSDate = objc.js(now);
console.log('asJSDate:', asJSDate); // asJSDate: 2022-02-04T12:15:44.862Z

let asNSDate = objc.ns(asJSDate);
console.log('asNSDate:', asNSDate); // asNSDate: [objc: 2022-02-04 12:15:44 +0000]


let localizedDate = NSDateFormatter.localizedStringFromDate_dateStyle_timeStyle_(now, 2, 2);
console.log('localized:', String(localizedDate)); // localized: 4 Feb 2022 at 12:15:44
