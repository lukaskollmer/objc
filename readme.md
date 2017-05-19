# objc [![Build Status](https://travis-ci.org/lukaskollmer/objc.svg?branch=master)](https://travis-ci.org/lukaskollmer/objc)  [![Coverage Status](https://coveralls.io/repos/github/lukaskollmer/objc/badge.svg?branch=master)](https://coveralls.io/github/lukaskollmer/objc?branch=master) [![npm](https://img.shields.io/npm/v/objc.svg)](https://www.npmjs.com/package/objc) [![node](https://img.shields.io/node/v/objc.svg)](https://www.npmjs.com/package/objc)

> NodeJS ⇆ Objective-C bridge _(experimental)_


## Install

```
$ npm install --save objc
```


## Usage

```js
const objc = require('objc');

const {
  NSDate,
  NSDateFormatter
} = objc;


let now = NSDate.date()
let localizedDate = NSDateFormatter.localizedStringFromDate_dateStyle_timeStyle_(now, 2, 2);

console.log(localizedDate); // -> "19. Apr 2017, 22:41:13"

```

## Documentation

- [API](https://lukaskollmer.github.io/objc/api.html)
- [Calling methods](https://lukaskollmer.github.io/objc/calling-methods.html)
- [Loading ObjC constants](https://lukaskollmer.github.io/objc/loading-objc-constants.html)
- [Pass by reference](https://lukaskollmer.github.io/objc/pass-by-reference.html)
- [Type conversion](https://lukaskollmer.github.io/objc/type-conversion.html)



## TODO
This is very much still work in progress and there's a bunch of stuff that either has some bugs or still needs to be implemented. These are key features I'd like to add in the future:
- [ ] `NSDictionary` ⇆ `Object` conversion
- [ ] Blocks


## License

MIT © [Lukas Kollmer](https://lukas.vip)
