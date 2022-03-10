#!/usr/bin/env node

const objc = require('../src/index');
const ref = require('ref-napi');

objc.import('AppKit');

const {
    NSString,
    NSMutableString,
    NSAttributedString,
    NSMutableAttributedString,
    NSLinkAttributeName,
    NSRange,
} = objc;



let attrString = NSMutableAttributedString.new();

attrString.appendAttributedString_(
  NSAttributedString.alloc().initWithString_attributes_('ABC', {
    [NSLinkAttributeName]: 'https://example.com',
  })
);

attrString.appendAttributedString_(
  NSAttributedString.alloc().initWithString_attributes_('DEFG', {
    [NSLinkAttributeName]: 'https://example.de',
  })
);

console.log(attrString); // [objc: ABC{ NSLink = "https://example.com"; }DEFG{ NSLink = "https://example.de"; }]



let range = new NSRange({location: 0, length: attrString.length()});
//console.log(range);



// (void (^)(NSDictionary<NSAttributedStringKey, id> * attrs, NSRange range, BOOL * stop))
const enumeratorBlock = objc.defineBlock('v@@{_NSRange}^B'); // TO DO: there is an 'already existss' error if {_NSRange=QQ} is used, which shouldn't happen as long as type encodings are the same/equivalent in both


let block = new enumeratorBlock(
  (attrs, range, stop) => { // TO DO: stop should be Ref containing boolean; on return, its original ptr needs updated
    console.log(`block called w/ args attrs: ${attrs}, range: ${[range.location, range.length]}, stop: ${stop.value}`);
    //ref.set(arg2, 0, 1); // uncomment this to have it stop iterating after the first range. // TO DO: update
    return;
  }
);

/* TO DO: FIX

Error: NSConcreteMutableAttributedString.enumerateAttributesInRange_options_usingBlock_ expected 'v@:{_NSRange=QQ}Q@?', got ([StructType], [number], [AnonymousBlock]): RangeError: Maximum call stack size exceeded}
    at Object.proxy [as msgSend] (/Users/has/node_modules/ffi-napi/lib/_foreign_function.js:61:14)
    at Proxy.callObjCMethod (/Users/has/dev/javascript/objc/src/instance.js:118:37)
    at Object.<anonymous> (/Users/has/dev/javascript/objc/examples/range.js:68:12)
    at Module._compile (node:internal/modules/cjs/loader:1101:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
    at Function.Module._load (node:internal/modules/cjs/loader:822:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:81:12)
    at node:internal/main/run_main_module:17:47

*/

attrString.enumerateAttributesInRange_options_usingBlock_(range, 0, block);

