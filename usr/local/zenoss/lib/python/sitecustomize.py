import sys, os, site; sys.setdefaultencoding('utf-8'); site.addsitedir(os.path.join(os.getenv('ZENHOME'), 'ZenPacks')); import warnings; warnings.filterwarnings('ignore', '.*', DeprecationWarning)
