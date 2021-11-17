const objc = require('../');
const ref = require('ref-napi');

objc.import('AppKit');

const {
    NSString,
    NSMutableString,
    NSAttributedString,
    NSMutableAttributedString,
    NSLinkAttributeName
} = objc;

const { id, NSRange } = objc.types;


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

console.log(attrString);


let range = NSRange.new(0, attrString.length());
console.log(range);


let block = new objc.Block((arg0, arg1, arg2) => {
    const attrs = objc.wrap(arg0);
    const range = arg1;
    console.log(`block called w/ args attrs: ${attrs}, range: ${[arg1.location, arg1.length]}, stop: ${arg2.deref()}`);
    //ref.set(arg2, 0, 1); // uncomment this to have it stop iterating after the first range.
    return;
}, objc.types.void, [id, NSRange, ref.refType(objc.types.char)]);

attrString.enumerateAttributesInRange_options_usingBlock_(range, 0, block);

