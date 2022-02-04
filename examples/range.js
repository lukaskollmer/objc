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

const internal = objc.__internal__;


let attrString = NSMutableAttributedString.new();

attrString.appendAttributedString_(NSAttributedString.alloc().initWithString_attributes_(
    'abc', {
        [NSLinkAttributeName]: 'https://example.com'
    }
));

attrString.appendAttributedString_(NSAttributedString.alloc().initWithString_attributes_(
    'def', {
        [NSLinkAttributeName]: 'https://example.de'
    }
));

console.log(attrString); // [objc: abc{ NSLink = "https://example.com"; }def{ NSLink = "https://example.de"; }]



let range = NSRange.new(0, attrString.length());
console.log(range);



// TO DO: FIX: following fails with ERROR: skipping unrecognized argument 2 encoding: "{_SRange=QQ}" (substituting 'pointer', which is incorrect and will likely error/crash when used) Error: Missing struct definition for '_SRange'


let block = new objc.Block(
  (arg0, arg1, arg2) => {
    const attrs = internal.wrap(arg0);
    const range = arg1;
    console.log(`block called w/ args attrs: ${attrs}, range: ${[arg1.location, arg1.length]}, stop: ${arg2.deref()}`);
    //ref.set(arg2, 0, 1); // uncomment this to have it stop iterating after the first range.
    return;
  }, 
  internal.types.void, [internal.types.id, NSRange, ref.refType(internal.types.char)]
);

attrString.enumerateAttributesInRange_options_usingBlock_(range, 0, block);

