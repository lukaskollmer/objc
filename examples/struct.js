const objc = require('../');
const ffi = require('ffi-napi');
const CGFloat = objc.types.double;

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
const string = objc.wrap(libFoundation.NSStringFromRect(rect));
console.log(string);

const string2 = objc.ns('{{1, 2}, {3, 4}}');
const rect2 = libFoundation.NSRectFromString(string2.__ptr);
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
