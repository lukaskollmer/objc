#!/usr/bin/env python3

from Foundation import *
from datetime import datetime as dt

n = 100_000

def test():
	v = NSString.stringWithString_('')
	t = dt.now()
	b = True
	for i in range(n): 
		v = NSString.stringWithString_(str(i)) #and v
		b = 1 and v.description()
	print(b, 'P:', ((dt.now()-t).total_seconds()))# * 1_000) / n, 'ms')

test()