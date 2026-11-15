import re, glob, collections, os, sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'apps', 'web', 'src')
files = sorted(glob.glob(os.path.join(root, '**', '*.vue'), recursive=True) +
               glob.glob(os.path.join(root, '**', '*.css'), recursive=True))

br = collections.Counter()
bs = collections.Counter()
fs = collections.Counter()
hexc = collections.Counter()
where = collections.defaultdict(set)

for f in files:
    s = open(f, encoding='utf-8').read()
    rel = os.path.relpath(f, root)
    for m in re.findall(r'border-radius:\s*([^;\n"\'}]+)', s):
        br[m.strip()] += 1
        where['br:' + m.strip()].add(rel)
    for m in re.findall(r'box-shadow:\s*([^;\n"\'}]+)', s):
        bs[m.strip()] += 1
        where['bs:' + m.strip()].add(rel)
    for m in re.findall(r'font-size:\s*([0-9.]+px)', s):
        fs[m] += 1
    for m in re.findall(r'#[0-9a-fA-F]{6}\b', s):
        hexc[m.lower()] += 1

def dump(title, counter, limit=40):
    print('== %s (%d distinct) ==' % (title, len(counter)))
    for k, v in counter.most_common(limit):
        print('%4d | %s' % (v, k))
        if '-v' in sys.argv:
            for w in sorted(where.get(('br:' if title.startswith('radius') else 'bs:') + k, [])):
                print('       ', w)
    print()

dump('radius', br)
dump('shadow', bs)
print('== font-size ==')
for k, v in sorted(fs.items(), key=lambda kv: float(kv[0][:-2])):
    print('%4d | %s' % (v, k))
print()
print('== hex ==')
for k, v in hexc.most_common(40):
    print('%4d | %s' % (v, k))
