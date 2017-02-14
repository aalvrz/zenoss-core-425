dm.reuse
========

Utilities to reuse (slightly modified) objects in new contexts.

Currently, there is a single utility: `rebindFunction`.
It allows to reuse the code of a function while changing name, globals,
default arguments and/or properties.

Lets look at a trivial example. Function `f` accesses global variables
`i` and `j`.

>>> i = 1; j = 2
>>> def f(): return i, j
...
>>> f()
(1, 2)

We want to derive a new function `g` which binds `i` to `-1`:

>>> from dm.reuse import rebindFunction
>>> g=rebindFunction(f, i=-1)
>>> g()
(-1, 2)

We can specify the rebinds not only via keyword arguments but via
a dictionary as well:

>>> g=rebindFunction(f, dict(i=-1, j=-2))
>>> g()
(-1, -2)

Usually, the function name is taken over from the original function,
but it can be changed:

>>> f.func_name
'f'
>>> g.func_name
'f'
>>> g=rebindFunction(f, dict(i=-1, j=-2), funcName='g')
>>> g.func_name
'g'
>>> g()
(-1, -2)

The originals function docstring is taken over, too -- unless
overridden:

>>> f.func_doc = 'some documentation'
>>> g=rebindFunction(f, dict(i=-1, j=-2))
>>> f.__doc__ is g.__doc__
True
>>> g=rebindFunction(f, dict(i=-1, j=-2), funcDoc='some new documentation')
>>> g.__doc__
'some new documentation'

Default values for arguments can be added, removed or changed.
Unknown arguments are recognized:

>>> def f(a1, a2=2): return a1, a2
...
>>> g=rebindFunction(f, argRebindDir=dict(a1=1))
>>> g()
(1, 2)

>>> from dm.reuse import REQUIRED
>>> g=rebindFunction(f, argRebindDir=dict(a2=REQUIRED))
>>> g(1)
Traceback (most recent call last):
  ...
TypeError: f() takes exactly 2 arguments (1 given)

>>> g=rebindFunction(f, argRebindDir=dict(a2=10))
>>> g(1)
(1, 10)

>>> g=rebindFunction(f, argRebindDir=dict(a3=10))
Traceback (most recent call last):
  ...
ValueError: unknown arguments in `argRebindDir`: a3

Finally, function properties can be rebound with `propRebindDir`.
We are careful, to give the new function a separate new property dict.

>>> f.prop='p'
>>> g=rebindFunction(f)
>>> g.prop
'p'
>>> g=rebindFunction(f, propRebindDir=dict(prop='P', prop2='p2'))
>>> g.prop, g.prop2
('P', 'p2')
>>> f.__dict__
{'prop': 'p'}



