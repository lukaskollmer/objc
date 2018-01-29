const runtime = require('./runtime');
const Instance = require('./instance');
const {InstanceProxy, MethodProxy} = require('./proxies');

const proxyForClass = classname => {
  return new InstanceProxy(new Instance(classname));
};


//const [NSDate, NSString, NSNumber] = ['NSDate', 'NSString', 'NSNumber'].map(cls => proxyForClass(cls));


/*const js = object => {
  if (object.isKindOfClass_(NSString)) {
    return object.UTF8String();
  }

  if (object.isKindOfClass_(NSNumber)) {
    return object.doubleValue();
  }

  if (object.isKindOfClass_(NSDate)) {
    return new Date(object.timeIntervalSince1970() * 1000);
  }

  return object;
}

const ns = object => {
  console.log(`this is where we'll somehow turn '${object}' (${typeof object}) into an objc object`);

  if (object instanceof Date) {
    const secondsSince1970 = Number(object) / 1000;
    return NSDate.dateWithTimeIntervalSince1970_(secondsSince1970);
  }

  return object;
}*/

module.exports = {
  js: () => {},
  ns: () => {}
}
