'use strict';

const objc = require('../src/');
const util = require('util');

const {
	NSDate,
	NSDateFormatter
} = objc;


let now = NSDate.date();
console.log('LOG DATE')
console.log('now', now);

// Convert the NSDate object to a JavaScript date
let asJSDate = objc.js(now);
console.log('asJSDate', asJSDate);

let asNSDate = objc.ns(asJSDate);
console.log('asNSDate', asNSDate);


let localizedDate = NSDateFormatter.localizedStringFromDate_dateStyle_timeStyle_(now, 2, 2);
console.log('loc', String(localizedDate)); // -> "19. Apr 2017, 22:41:13"
