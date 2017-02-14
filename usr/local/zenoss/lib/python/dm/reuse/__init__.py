# Copyright (C) 2004-2007 by Dr. Dieter Maurer, Illtalstr. 25, D-66571 Eppelborn, Germany
# see "LICENSE.txt" for details

from types import FunctionType
from inspect import getargspec

# marker value representing required arguments
REQUIRED = object()

def rebindFunction(f, rebindDir=None,
                   funcName=None, funcDoc=None,
                   argRebindDir=None, propRebindDir=None,
                   **rebinds):
  '''return a function derived from *f* with rebinds specified by *rebindDir* and/or *rebinds*.

  Use *funcName* as function name, instead of `f.func_name` as function
  name, if given.
  
  *argRebindDir* is a dictionary mapping function parameter names
  to defaults. You can use this to turn required parameters into optional
  ones (by providing a default value for them), to change their
  default values or to turn optional parameters into required ones.
  Note that Python requires that required arguments must preceed
  optional ones. A `ValueError` is raised when *argRebindDir* violates
  this restriction.
  Note: we only support simply named parameters (not constructor expressions).

  *propRebindDir* is a dictionary specifying rebinds for the
  functions properties.

  ATT: *f.func_globals* is copied at rebind time. Later modifications
  may affect *f* but not the rebind function.

  Note: we would like to rebind closure parts as well but Python currently
  does not allow to create `cell` instances. Thus, this would be difficult.
  '''
  # unwrap a method
  f = getattr(f, 'im_func', f)
  # handle global variable rebinds
  fg = f.func_globals.copy()
  if rebindDir: fg.update(rebindDir)
  if rebinds: fg.update(rebinds)
  # handle argument (default) rebinds
  if argRebindDir:
    args, _, _, defaults = getargspec(f)
    # ensure all arguments are known
    unknown = []
    for a in argRebindDir:
      if a not in args: unknown.append(a)
    if unknown:
      raise ValueError('unknown arguments in `argRebindDir`: %s'
                       % ', '.join(unknown)
                       )
    # determine new defaults
    defaults = defaults is not None and list(defaults) or []
    defaults = [REQUIRED] * (len(args) - len(defaults)) + defaults
    funcDefaults = []
    for (a,d) in zip(args, defaults):
      if isinstance(a, str) and a in argRebindDir: d = argRebindDir[a]
      if d is not REQUIRED: funcDefaults.append(d)
      elif funcDefaults: raise ValueError('required argument after optional one: %s' % a)
    funcDefaults = tuple(funcDefaults)
  else: funcDefaults = f.func_defaults or ()
  # construct the new function
  nf = FunctionType(
    f.func_code,
    fg, # func_globals
    funcName or f.func_name,
    funcDefaults,
    f.func_closure,
    )
  # handle the documentation
  if funcDoc is not None: nf.func_doc = funcDoc
  else: nf.func_doc = f.func_doc
  # handle is properties
  if f.__dict__ is not None: nf.__dict__ = f.__dict__.copy()
  if propRebindDir:
    if nf.__dict__ is None: nf.__dict__ = {}
    nf.__dict__.update(propRebindDir)
  return nf
