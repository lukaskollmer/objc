#!/usr/bin/env node

const ffi = require('ffi-napi');

const objc = require('../src/index');
const internal = objc.__internal__;


// TO DO: may be worth moving this into objc, so NSStringFromRect and NSRectFromString are available same as NSRange
const CGFloat = internal.types.double;

const CGPoint = objc.defineStruct('CGPoint', {
  x: CGFloat,
  y: CGFloat
});

const CGSize = objc.defineStruct('CGSize', {
  width: CGFloat,
  height: CGFloat
});

const CGRect = objc.defineStruct('CGRect', {
  origin: CGPoint,
  size: CGSize
});

const libFoundation = new ffi.Library(null, {
  NSStringFromRect: ['pointer', [CGRect]],
  NSRectFromString: [CGRect, ['pointer']]
});
const rect = CGRect.new(
  CGPoint.new(5, 10),
  CGSize.new(100, 250)
);
const string = internal.wrap(libFoundation.NSStringFromRect(rect));
console.log((string.description())); // [objc: {{5, 10}, {100, 250}}]

// TO DO: update
/*
const string2 = objc.ns('{{1, 2}, {3, 4}}');
const rect2 = libFoundation.NSRectFromString(string2[internal.__objcObject].ptr); // TO DO: decide 'internal' naming convention: 2 leading underscores, leading+trailing underscores, something else
console.log(rect2);
console.log(`
Rect {
  origin: {
    x: ${rect2.origin.x}
    y: ${rect2.origin.y}
  },
  size: {
    width:  ${rect2.size.width}
    height: ${rect2.size.height}
  }
}
`);
*/
