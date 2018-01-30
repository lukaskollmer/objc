'use strict';

const objc = require('../src/');

const {
	NSDate,
	NSDateFormatter
} = objc;

let now = NSDate.date();
console.log(now);

// Convert the NSDate object to a JavaScript date
let asJSDate = objc.js(now);
console.log(asJSDate);

let asNSDate = objc.ns(asJSDate);
console.log(asNSDate);


let localizedDate = NSDateFormatter.localizedStringFromDate_dateStyle_timeStyle_(now, 2, 2);
console.log(String(localizedDate)); // -> "19. Apr 2017, 22:41:13"
