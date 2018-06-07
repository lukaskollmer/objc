const objc = require('../src/index');
const {runtime, NSObject} = objc;

const LKGreeter_instanceMethods = {
  'greet:': (self, cmd, name) => {
    name = objc.wrap(name);
    return objc.ns(`hello, ${name}!`);
  },

  _encodings: {
    'greet:': ['@', ['@', ':', '@']]
  }
};

const LKGreeter_classMethods = {
  foo: (self, cmd) => {
    console.log('foo');
  },

  _encodings: {
    'foo': ['v', ['@', ':']]
  }
};


const LKGreeter = objc.createClass('LKGreeter', 'NSObject', LKGreeter_instanceMethods, LKGreeter_classMethods);

LKGreeter.foo();

console.log(LKGreeter.new().greet('lukas'));
