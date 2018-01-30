
/*
runtime.import('AppKit');


const main = new Proxy({}, {
  get: (target, name) => {
    return new InstanceProxy(new Instance(name))
  }
})


const {
  NSString,
  NSDate,
  NSDateFormatter
} = main;


let now = NSDate.date()
let localizedDate = NSDateFormatter.localizedStringFromDate_dateStyle_timeStyle_(now, 2, 2);

console.log(localizedDate); // -> "19. Apr 2017, 22:41:13"

console.log(NSDate.date());
*/

/*
const NSDate = new Instance('NSDate')
console.log(NSDate);

const date = NSDate.call('date');
console.log(date.description());


const newDate = date.call('dateByAddingTimeInterval:', 5);
console.log(newDate.description());


const NSProcessInfo = new Instance('NSProcessInfo');
console.log(`pi: ${NSProcessInfo.call("processInfo").description()}`);
*/
