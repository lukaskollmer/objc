# Blocks

The `objc` module has basic support for Objective-C blocks.

You can create a block with the `objc.Block` helper class:
```js
const block = new objc.Block(() => {
  console.log('In the block!');
}, ['v', []]);
```

When creating a block, you need to explicitly declare the type encoding of the block's return value and all its parameters. The `objc` module will use this information to automatically convert values to the expected type.

**Note**  
1. When a block takes an Objective-C object as its parameter, you'll need to manually wrap that object in an `objc.Proxy`.
2. This currently only supports blocks that are executed on the main thread

<br>

**Example:** Sort an array by word length, longest to shortest
```js
const {NSArray, Block, Proxy} = require('objc');
const array = NSArray.arrayWithArray_(['I', 'Am', 'The', 'Doctor']);

const block = new Block((obj1, obj2) => {
  obj1 = new Proxy(obj1);
  obj2 = new Proxy(obj2);
  return obj1.length() > obj2.length() ? -1 : 1;
}, ['i', ['@', '@']]);

const sorted = array.sortedArrayUsingComparator_(block);
// => ['Doctor', 'The', 'Am', 'I']
```
