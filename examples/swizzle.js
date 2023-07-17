const ref = require('@breush/ref-napi');
const objc = require('../src/index');

const {
  NSDate,
  NSProcessInfo,
  wrap
} = objc;

objc.swizzle(NSDate, 'date', () => {
  return NSDate.distantPast();
}, 'class');


console.log(`+[NSDate date         ]: ${NSDate.date()}`);
console.log(`+[NSDate date         ]: ${NSDate.date()}`);
console.log(`+[NSDate distantPast  ]: ${NSDate.distantPast()}`);
console.log(`+[NSDate distantFuture]: ${NSDate.distantFuture()}`);
console.log(`+[NSDate xxx__date    ]: ${NSDate.xxx__date()}`);


objc.swizzle('NSProcessInfo', 'processorCount', () => {
  return 12;
});

const pi = NSProcessInfo.processInfo();
console.log(pi.processorCount());


objc.swizzle(NSDate, 'dateByAddingTimeInterval:', (self, _cmd, timeInterval) => {
  self = wrap(self);
  return self.xxx__dateByAddingTimeInterval_(timeInterval * 2);
});

const now = NSDate.xxx__date();
console.log(now);
console.log(now.dateByAddingTimeInterval_(2));
