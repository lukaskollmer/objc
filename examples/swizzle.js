#!/usr/bin/env node

const objc = require('../src/index');

const { NSDate, NSProcessInfo } = objc;


const swapper = objc.__internal__.swizzle(NSDate, 'date', (self) => {
  return NSDate.distantPast();
}, true);


// +[NSDate date         ]: Fri Dec 29 0000 23:58:45 GMT-0001 (Greenwich Mean Time)
// +[NSDate date         ]: Fri Dec 29 0000 23:58:45 GMT-0001 (Greenwich Mean Time)
// +[NSDate distantPast  ]: Fri Dec 29 0000 23:58:45 GMT-0001 (Greenwich Mean Time)
// +[NSDate distantFuture]: Mon Jan 01 4001 00:00:00 GMT+0000 (Greenwich Mean Time)
// TO DO: FIX: TypeError: No method named objc.NSDate.xxx__date

console.log(`+[NSDate date         ]: ${NSDate.date()}`);
console.log(`+[NSDate date         ]: ${NSDate.date()}`);
console.log(`+[NSDate distantPast  ]: ${NSDate.distantPast()}`);
console.log(`+[NSDate distantFuture]: ${NSDate.distantFuture()}`);
//console.log(`+[NSDate xxx__date    ]: ${NSDate.xxx__date()}`);



objc.__internal__.swizzle(NSProcessInfo, 'processorCount', (self) => { // TO DO: FIX: bus error
  return 71;
});


const pi = NSProcessInfo.processInfo();
console.log('fake processor count:', pi.processorCount()); // 71

objc.__internal__.swizzle(NSDate, 'dateByAddingTimeInterval:', (self, timeInterval) => {
  return self.xxx__dateByAddingTimeInterval_(timeInterval * 2);
});


//
//const now = NSDate.xxx__date(); // TO DO: FIX: this still throws error: No method named objc.NSDate.xxx__date
//console.log(now);
//console.log(now.dateByAddingTimeInterval_(2));
