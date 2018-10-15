const objc = require('../');
const ffi = require('ffi');
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
  NSStringFromRect: ['pointer', [CGRect]]
});
const rect = CGRect.new(
  CGPoint.new(5, 10),
  CGSize.new(100, 250)
);
const string = objc.wrap(libFoundation.NSStringFromRect(rect));
console.log(string);
