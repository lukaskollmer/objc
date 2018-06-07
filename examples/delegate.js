const objc = require('../src/index');

const {
  NSFileManager,
  NSString,
  NSURL
} = objc;



const FileManagerDelegate = objc.createClass('FileManagerDelegate', 'NSObject', {
  'fileManager:shouldMoveItemAtPath:toPath:': (self, cmd, fileManager, srcPath, dstPath) => {
    console.log('-[NSFileManagerDelegate fileManager:shouldMoveItemAtPath:toPath:]');
    return 1;
  },

  _encodings: {
    'fileManager:shouldMoveItemAtPath:toPath:': ['c40', ['@0', ':8', '@16', '@24', '@32']]
  }
});




const fm = NSFileManager.new();
const delegate = FileManagerDelegate.new();
fm.setDelegate_(delegate);


const pathA = 'x.txt';
const pathB = 'y.txt';

// create file

const data = objc.ns('hello world').dataUsingEncoding_(4);
fm.createFileAtPath_contents_attributes_(pathA, data, null);


// move file
fm.moveItemAtPath_toPath_error_(pathA, pathB, null);


// delete file
let url = NSURL.fileURLWithPath_(pathB);
fm.trashItemAtURL_resultingItemURL_error_(url, null, null);
