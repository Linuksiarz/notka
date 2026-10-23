"""Generates Notka's built-in background artwork (CC0): nine scenes, a light and a dark variant.

usage: python3 tools/generate-backgrounds.py frontend/public/backgrounds

Every picture is 1000x1000, drawn for how the app crops it (`palette.css`, `NoteEditor.svelte`):

- a card and the desktop editor use `cover` from the **bottom right**, so a wide note shows the
  lower band and a tall one the right part: the scene's subject is in the lower right quarter;
- the phone's editor scales the square to the screen's height from the **right top**, so the right
  half is the whole screen there, and the keyboard covers its lower part when typing: something
  worth seeing reaches up the right side into the middle;
- the top is the system's status bar on a phone, which only takes a colour: the upper part of every
  picture is one flat colour, its tint (`--theme-tint-<id>` in `palette.css`), and detail starts
  well below it.

The colours are one family around Notka's sea green (`--keep-brand` #12a594, `--keep-brand-fold`
#0b6e63): every scene carries those teals, set against a sky of its own — sand, peach, aqua, apricot,
mist, mint, sky, butter, coral — and the dark variants the same scenes at dusk.
"""
import math
import os
import random
import sys

W = 1000
CALM = 300  # above this line every picture is its flat tint


def num(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def attrs(fill=None, stroke=None, width=None, op=None, cap='round', tf=None):
    out = []
    if fill is not None:
        out.append(f'fill="{fill}"')
    if stroke:
        out.append(f'stroke="{stroke}" stroke-width="{num(width)}" stroke-linecap="{cap}" stroke-linejoin="round"')
    if op is not None and op < 1:
        out.append(f'opacity="{op}"')
    if tf:
        out.append(f'transform="{tf}"')
    return ' '.join(out)


def P(d, fill='none', stroke=None, width=0, op=None, cap='round', tf=None):
    return f'<path d="{d}" {attrs(fill, stroke, width, op, cap, tf)}/>'


def C(cx, cy, r, fill='none', stroke=None, width=0, op=None):
    return f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}" {attrs(fill, stroke, width, op)}/>'


def E(cx, cy, rx, ry, fill='none', stroke=None, width=0, op=None, tf=None):
    return f'<ellipse cx="{num(cx)}" cy="{num(cy)}" rx="{num(rx)}" ry="{num(ry)}" {attrs(fill, stroke, width, op, tf=tf)}/>'


def R(x, y, w, h, fill, rx=0, op=None, tf=None):
    r = f' rx="{num(rx)}"' if rx else ''
    return f'<rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}"{r} {attrs(fill, op=op, tf=tf)}/>'


def L(x1, y1, x2, y2, stroke, width, op=None, cap='round'):
    return P(f'M{num(x1)} {num(y1)}L{num(x2)} {num(y2)}', stroke=stroke, width=width, op=op, cap=cap)


def G(parts, tf=None, op=None):
    return f'<g {attrs(op=op, tf=tf)}>' + ''.join(parts) + '</g>'


def poly(points, fill, op=None):
    return P('M' + 'L'.join(f'{num(x)} {num(y)}' for x, y in points) + 'Z', fill, op=op)


def leaf(x, y, length, width, angle, fill, op=None):
    """A pointed leaf from (x, y), pointing up when the angle is 0."""
    h = width / 2
    d = f'M0 0C{num(h)} {num(-length * .3)} {num(h)} {num(-length * .7)} 0 {num(-length)}C{num(-h)} {num(-length * .7)} {num(-h)} {num(-length * .3)} 0 0Z'
    return P(d, fill, op=op, tf=f'translate({num(x)} {num(y)}) rotate({num(angle)})')


def frond(x, y, length, angle, droop, fill, leaflets=12, size=1.0):
    """A palm frond: a curved rib with leaflets hanging from it."""
    a = math.radians(angle)
    ex, ey = x + length * math.cos(a), y + length * math.sin(a)
    cx, cy = (x + ex) / 2, (y + ey) / 2 - droop
    out = [P(f'M{num(x)} {num(y)}Q{num(cx)} {num(cy)} {num(ex)} {num(ey)}', stroke=fill, width=5 * size)]
    for i in range(1, leaflets + 1):
        t = i / (leaflets + 1)
        px = (1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * ex
        py = (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t * t * ey
        tx = 2 * (1 - t) * (cx - x) + 2 * t * (ex - cx)
        ty = 2 * (1 - t) * (cy - y) + 2 * t * (ey - cy)
        direction = math.degrees(math.atan2(ty, tx))
        ln = (70 - 40 * t) * size
        for side in (-1, 1):
            out.append(leaf(px, py, ln, 13 * size, direction + 90 + side * 55 + 30, fill))
    return out


def canopy(blobs, base, light, shade=None):
    """A tree's crown: overlapping discs, a lighter cap on each."""
    out = [C(x, y, r, base) for x, y, r in blobs]
    out += [C(x - r * .25, y - r * .3, r * .62, light) for x, y, r in blobs]
    if shade:
        out += [P(f'M{num(x - r)} {num(y)}A{num(r)} {num(r)} 0 0 0 {num(x + r)} {num(y)}Z', shade, op=.55) for x, y, r in blobs[:2]]
    return out


def sky(p, haze_from=.42, haze_to=.78):
    """The flat tint, warming towards the horizon only below the calm band."""
    if 'haze' not in p:
        return [R(0, 0, W, W, p['sky'])]
    return [
        f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="{haze_from}" stop-color="{p["sky"]}"/><stop offset="{haze_to}" stop-color="{p["haze"]}"/>'
        f'</linearGradient></defs>',
        R(0, 0, W, W, 'url(#sky)'),
    ]


def scatter(seed, n, box, draw, avoid=None):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(box[0], box[2]), rnd.uniform(box[1], box[3])
        if avoid and avoid(x, y):
            continue
        out.append(draw(rnd, x, y))
    return out


def grass(seed, x0, x1, y, color, n=40, height=26):
    rnd = random.Random(seed)
    d = []
    for _ in range(n):
        x = rnd.uniform(x0, x1)
        h = rnd.uniform(height * .5, height)
        lean = rnd.uniform(-8, 8)
        d.append(f'M{num(x - 3)} {num(y)}Q{num(x + lean * .3)} {num(y - h * .6)} {num(x + lean)} {num(y - h)}Q{num(x + 1)} {num(y - h * .5)} {num(x + 3)} {num(y)}Z')
    return [P(''.join(d), color)]


# ------------------------------------------------------------------------------------------ scenes

def groceries(p):
    """A wooden crate of produce on the ground, greens and a paper bag reaching up the right."""
    out = sky(p)
    out += [
        P('M0 760C180 735 360 748 560 732C740 718 880 724 1000 712L1000 1000L0 1000Z', p['far']),
        P('M0 820C220 800 420 812 640 798C800 788 900 792 1000 786L1000 1000L0 1000Z', p['ground']),
    ]
    out += grass(11, 0, 1000, 822, p['far'], n=70, height=22)
    # the greens behind the crate: carrot tops, leek and chard leaves rising up the right side
    rnd = random.Random(3)
    for i in range(11):
        bx = 640 + i * 32 + rnd.uniform(-8, 8)
        ln = rnd.uniform(200, 360)
        out.append(leaf(bx, 780, ln, rnd.uniform(60, 96), rnd.uniform(-30, 28), p['green2' if i % 3 else 'green3']))
    for i in range(9):
        bx = 700 + i * 30
        out.append(leaf(bx, 790, rnd.uniform(150, 250), 52, rnd.uniform(-24, 24), p['green1']))
    # veins on the large leaves
    out += [P(f'M{x} 780Q{x + 6} 640 {x + s} {y}', stroke=p['vein'], width=3, op=.6) for x, s, y in ((760, -30, 520), (850, 20, 470), (930, 26, 560))]
    # the paper bag on the right edge, a baguette and celery out of it
    out += [
        P('M905 600L1000 590L1000 1000L890 1000Z', p['bag']),
        P('M905 600L1000 590L1000 616L912 628Z', p['bag2']),
        P('M928 600C930 520 950 430 972 380C980 366 996 370 992 388C978 452 962 526 958 600Z', p['bread']),
        *[P(f'M{938 + i * 4} {560 - i * 46}l18 -10', stroke=p['bread2'], width=5) for i in range(4)],
        *[leaf(975 + i * 8, 600, 160 + i * 26, 22, 10 + i * 6, p['green3']) for i in range(3)],
    ]
    # the crate: teal slats with the produce heaped on top
    produce = [
        (600, 770, 46, 'orange'), (690, 754, 50, 'apple'), (780, 762, 46, 'orange'),
        (860, 772, 42, 'apple'), (645, 735, 40, 'lemon'), (740, 722, 44, 'apple'),
        (822, 730, 40, 'orange'), (560, 790, 36, 'lemon'),
    ]
    for x, y, r, kind in produce:
        out += [C(x, y, r, p[kind]), C(x - r * .35, y - r * .35, r * .32, p['shine'], op=.45)]
        if kind == 'apple':
            out += [P(f'M{x} {y - r + 4}q4 -20 14 -26', stroke=p['stem'], width=5), leaf(x + 8, y - r - 8, 30, 14, 60, p['green1'])]
        if kind == 'orange':
            out += [C(x, y - r + 8, 4, p['stem'])]
    out += [
        R(520, 790, 400, 210, p['crate'], rx=6),
        *[R(520, 800 + i * 58, 400, 40, p['crate2'], rx=4) for i in range(3)],
        *[L(540, 820 + i * 58, 900, 820 + i * 58, p['crate'], 2, op=.5) for i in range(3)],
        R(520, 790, 26, 210, p['crate3']), R(894, 790, 26, 210, p['crate3']),
        *[C(533, 812 + i * 58, 4, p['crate']) for i in range(3)],
        *[C(907, 812 + i * 58, 4, p['crate']) for i in range(3)],
        R(560, 860, 150, 64, p['label'], rx=4),
        P('M580 880h100M580 900h70', stroke=p['crate'], width=6),
    ]
    # loose produce on the ground to the left, a pear and a bunch of radishes
    out += [
        P('M420 900C384 900 376 852 400 828C406 802 432 800 440 826C466 852 458 900 420 900Z', p['lemon']),
        P('M420 806q2 -16 10 -24', stroke=p['stem'], width=5),
        *[C(300 + i * 34, 920 - (i % 2) * 10, 20, p['apple']) for i in range(3)],
        *[leaf(300 + i * 34, 902 - (i % 2) * 10, 70, 18, -20 + i * 20, p['green1']) for i in range(3)],
        E(180, 930, 70, 16, p['shadow'], op=.5), C(170, 906, 26, p['orange']), C(206, 912, 22, p['lemon']),
    ]
    out += scatter(5, 26, (0, 860, 1000, 990), lambda r, x, y: E(x, y, r.uniform(3, 7), 2.5, p['far']))
    return out


def food(p):
    """A teal bowl of noodles on the right edge, chopsticks lifting a strand, steam rising."""
    out = sky(p)
    out += [
        P('M0 820L1000 770L1000 1000L0 1000Z', p['table']),
        P('M0 820L1000 770L1000 782L0 834Z', p['table2']),
        *[L(0, 870 + i * 44, 1000, 822 + i * 44, p['table2'], 2, op=.5) for i in range(4)],
    ]
    # steam: soft curls up the right side
    out += [P(f'M{x} 700C{x - 40} 640 {x + 40} 590 {x} 530C{x - 36} 480 {x + 30} 430 {x + 6} {y}', stroke=p['steam'], width=w, op=.55)
            for x, y, w in ((700, 380, 14), (790, 340, 18), (880, 400, 14))]
    # chopsticks lifting a noodle
    out += [
        L(760, 760, 980, 360, p['stick'], 13), L(800, 770, 1000, 400, p['stick2'], 13),
        P('M832 520C820 600 860 640 840 720M850 530C846 600 880 650 862 740M866 520C878 600 900 650 884 732', stroke=p['noodle'], width=7),
        P('M832 520C820 600 860 640 840 720', stroke=p['noodle2'], width=2),
    ]
    # the bowl, cropped by the right edge as the original's is
    out += [
        E(780, 975, 300, 30, p['shadow'], op=.45),
        P('M470 790L1090 790C1090 900 980 980 780 980C580 980 470 900 470 790Z', p['bowl']),
        P('M520 840C560 920 660 960 780 962', stroke=p['bowl2'], width=10, op=.6),
        *[P(f'M{520 + i * 60} 860c10 20 30 20 40 0', stroke=p['bowl2'], width=6, op=.7) for i in range(9)],
        E(780, 790, 310, 46, p['bowl3']),
        E(780, 792, 292, 38, p['broth']),
    ]
    # noodles heaped in the bowl
    rnd = random.Random(8)
    d = []
    for _ in range(46):
        x = rnd.uniform(520, 1040)
        y = rnd.uniform(740, 800)
        w = rnd.uniform(40, 90)
        d.append(f'M{num(x)} {num(y)}c{num(w * .3)} {num(-30)} {num(w * .7)} {num(-30)} {num(w)} 0')
    out += [P(''.join(d), stroke=p['noodle'], width=7), P(''.join(d[::3]), stroke=p['noodle2'], width=2)]
    # toppings: an egg, greens, coral slices, sesame
    out += [
        E(640, 752, 46, 32, p['egg']), E(646, 756, 22, 18, p['yolk']),
        *[leaf(700 + i * 40, 760, 60, 20, -50 + i * 25, p['green']) for i in range(5)],
        *[E(860 + i * 44, 748 + (i % 2) * 14, 28, 12, p['slice'], tf=f'rotate({-10 + i * 8} {860 + i * 44} {748 + (i % 2) * 14})') for i in range(4)],
        *[E(860 + i * 44, 748 + (i % 2) * 14, 18, 6, p['slice2'], tf=f'rotate({-10 + i * 8} {860 + i * 44} {748 + (i % 2) * 14})') for i in range(4)],
        *scatter(9, 20, (600, 735, 1000, 790), lambda r, x, y: E(x, y, 3, 1.6, p['sesame'])),
    ]
    # a small dish of sauce and a folded napkin to the left
    out += [
        P('M200 880L420 852L460 900L236 930Z', p['napkin']),
        P('M236 930L460 900L462 912L238 942Z', p['napkin2']),
        E(310, 830, 90, 22, p['shadow'], op=.4),
        P('M222 800L398 800C398 836 360 852 310 852C260 852 222 836 222 800Z', p['dish']),
        E(310, 800, 88, 14, p['dish2']), E(310, 801, 74, 10, p['sauce']),
    ]
    return out


def music(p):
    """A record setting into the sea like a sun, notes flying over it like birds, headphones on the shore."""
    out = sky(p, .38, .72)
    # the record, half sunk behind the horizon
    cx, cy, r = 760, 720, 230
    grooves = ''.join(f'M{num(cx - rr)} {cy}A{rr} {rr} 0 0 1 {num(cx + rr)} {cy}' for rr in range(90, r - 8, 14))
    out += [
        C(cx, cy, r + 26, p['glow'], op=.5),
        P(f'M{cx - r} {cy}A{r} {r} 0 0 1 {cx + r} {cy}Z', p['record']),
        P(grooves, stroke=p['groove'], width=2.5, op=.8),
        P(f'M{cx - 150} {cy - 100}A180 180 0 0 1 {cx - 40} {cy - 170}', stroke=p['shine'], width=10, op=.5),
        P(f'M{cx - 80} {cy}A80 80 0 0 1 {cx + 80} {cy}Z', p['label']),
        P(f'M{cx - 52} {cy}A52 52 0 0 1 {cx + 52} {cy}', stroke=p['label2'], width=6),
        P(f'M{cx - 10} {cy}A10 10 0 0 1 {cx + 10} {cy}Z', p['sky']),
    ]
    # the sea and the record's reflection
    out += [P('M0 720L1000 720L1000 1000L0 1000Z', p['sea'])]
    rnd = random.Random(4)
    for i in range(12):
        y = 736 + i * 16
        half = (r - i * 15) * rnd.uniform(.75, 1)
        out.append(L(cx - half, y, cx + half, y, p['reflect'], 7 - i * .35, op=.85 - i * .05))
    out += scatter(6, 34, (0, 740, 1000, 990), lambda r_, x, y: L(x, y, x + r_.uniform(20, 60), y, p['wave'], 3, op=.6),
                   avoid=lambda x, y: abs(x - cx) < 200)
    # a distant island on the left
    out += [P('M0 720C40 690 90 676 150 684C200 650 260 654 300 700C330 706 350 712 360 720Z', p['island'])]
    # notes flying up the right side like a flock
    def note(x, y, s, color, double=False):
        if double:
            return G([E(0, 0, 13, 9, color, tf='rotate(-20)'), E(40, -10, 13, 9, color, tf='rotate(-20 40 -10)'),
                      L(11, -3, 11, -60, color, 5), L(51, -13, 51, -70, color, 5), P('M11 -60L51 -70L51 -56L11 -46Z', color)],
                     tf=f'translate({num(x)} {num(y)}) scale({s})')
        return G([E(0, 0, 13, 9, color, tf='rotate(-20)'), L(11, -3, 11, -62, color, 5),
                  P('M11 -62q20 10 22 32', stroke=color, width=5)], tf=f'translate({num(x)} {num(y)}) scale({s})')
    out += [note(620, 440, 1.1, p['note1'], True), note(760, 380, .9, p['note2']), note(870, 450, 1.2, p['note1']),
            note(540, 540, .7, p['note2']), note(930, 340, .7, p['note2'], True), note(450, 470, .55, p['note1'])]
    # the shore with headphones on it
    out += [
        P('M520 1000C600 930 760 900 1000 880L1000 1000Z', p['sand']),
        P('M600 1000C680 950 820 930 1000 924L1000 1000Z', p['sand2']),
        *grass(21, 900, 1000, 890, p['dune'], n=18, height=60),
        E(830, 985, 120, 14, p['dune'], op=.35),
        P('M730 950C720 830 940 830 930 950', stroke=p['phones2'], width=16),
        P('M730 950C720 830 940 830 930 950', stroke=p['phones'], width=8),
        E(724, 952, 34, 40, p['phones2'], tf='rotate(-12 724 952)'), E(936, 952, 34, 40, p['phones2'], tf='rotate(12 936 952)'),
        E(730, 950, 22, 30, p['phones'], tf='rotate(-12 730 950)'), E(930, 950, 22, 30, p['phones'], tf='rotate(12 930 950)'),
    ]
    return out


def recipes(p):
    """An open cookbook on a wooden table, ingredients tossed up out of it along the right side."""
    out = sky(p)
    out += [
        P('M0 760L1000 700L1000 1000L0 1000Z', p['table']),
        *[P(f'M0 {800 + i * 60}L1000 {740 + i * 60}', stroke=p['table2'], width=3, op=.6) for i in range(5)],
        *scatter(12, 30, (0, 760, 1000, 1000), lambda r, x, y: P(f'M{num(x)} {num(y)}q30 -4 60 -2', stroke=p['table2'], width=2, op=.5)),
    ]
    # a cutting board with a knife at the left, a plate cropped at the right
    out += [
        P('M60 880L330 820L380 900L110 965Z', p['board']), P('M110 965L380 900L382 914L112 980Z', p['board2']),
        C(84, 890, 12, p['table']),
        P('M150 905L300 870L304 882L156 918Z', p['blade']), P('M300 870L360 856L364 870L304 882Z', p['handle']),
        
    ]
    # the open book: a teal cover and cream pages, lying a little askew
    book = [
        R(-250, -10, 500, 200, p['cover'], rx=10),
        P('M-236 0C-160 -24 -60 -20 -4 8L-4 182C-60 158 -160 154 -236 176Z', p['page2']),
        P('M236 0C160 -24 60 -20 4 8L4 182C60 158 160 154 236 176Z', p['page2']),
        P('M-228 -8C-156 -32 -60 -28 -2 0L-2 172C-60 146 -156 144 -228 166Z', p['page']),
        P('M228 -8C156 -32 60 -28 2 0L2 172C60 146 156 144 228 166Z', p['page']),
        L(0, 0, 0, 174, p['spine'], 3),
        *[P(f'M-206 {num(18 + i * 22)}C-150 {num(2 + i * 22)} -80 {num(4 + i * 22)} -28 {num(24 + i * 22)}', stroke=p['ink'], width=3, op=.5) for i in range(6)],
        P('M-200 20h70', stroke=p['cover'], width=6),
        *[P(f'M120 {num(110 + i * 20)}C150 {num(100 + i * 20)} 190 {num(98 + i * 20)} 212 {num(104 + i * 20)}', stroke=p['ink'], width=3, op=.5) for i in range(3)],
        C(110, 50, 44, p['lemon2'], op=.35), C(110, 50, 36, p['lemon'], op=.8), leaf(140, 22, 40, 18, 40, p['basil']),
        P('M28 20h60M28 40h50', stroke=p['ink'], width=3, op=.5),
    ]
    out += [E(720, 930, 280, 34, p['table2'], op=.6), G(book, tf='translate(720 770) rotate(-6) scale(1 .78)')]
    # a whisk resting by the book
    # ingredients tossed up out of the book along the right side
    def lemon_slice(x, y, r, a):
        return G([C(0, 0, r, p['lemon2']), C(0, 0, r * .84, p['lemon']),
                  P(''.join(f'M0 0L{num(r * .78 * math.cos(math.radians(k * 45)))} {num(r * .78 * math.sin(math.radians(k * 45)))}' for k in range(8)), stroke=p['lemon2'], width=2.5)],
                 tf=f'translate({x} {y}) rotate({a}) scale(1 .45)')

    def tomato_slice(x, y, r, a):
        return G([C(0, 0, r, p['tomato']), C(0, 0, r * .8, p['tomato2']),
                  *[E(r * .45 * math.cos(math.radians(k * 120)), r * .45 * math.sin(math.radians(k * 120)), r * .18, r * .12, p['seed']) for k in range(3)]],
                 tf=f'translate({x} {y}) rotate({a}) scale(1 .5)')

    def onion(x, y, r, a):
        return G([C(0, 0, r, 'none', p['onion'], 5), C(0, 0, r * .62, 'none', p['onion'], 4)], tf=f'translate({x} {y}) rotate({a}) scale(1 .5)')

    out += [
        lemon_slice(640, 660, 46, 20), tomato_slice(790, 620, 52, -30), leaf(880, 560, 90, 40, 40, p['basil']),
        onion(700, 540, 44, 60), lemon_slice(900, 450, 44, -40), tomato_slice(790, 420, 42, 10),
        leaf(960, 360, 80, 34, -20, p['basil']), onion(940, 650, 38, -20), leaf(650, 470, 70, 30, 70, p['basil2']),
        leaf(560, 600, 60, 26, 120, p['basil2']), tomato_slice(560, 700, 34, 40), lemon_slice(700, 380, 32, 70),
        *scatter(14, 30, (520, 340, 1000, 740), lambda r, x, y: C(x, y, r.uniform(4, 8), p['pepper'])),
        *[P(f'M{x} {y}q10 -12 22 -6', stroke=p['herb'], width=4) for x, y in ((600, 520), (760, 500), (860, 360), (980, 520), (860, 700), (640, 400))],
    ]
    out += [L(330, 990, 400, 950, p['handle'], 10)] + [P(f'M400 950C{430 + k * 6} {910 - k * 4} {490 + k * 4} {910 + k * 6} 470 {940 + k * 3}C450 {966 + k * 2} 420 960 400 950', stroke=p['whisk'], width=2.5) for k in range(4)]
    out += [E(990, 990, 150, 50, p['plate2']), E(990, 982, 140, 42, p['plate']), E(990, 982, 96, 26, p['plate2'], op=.35),
            *[C(950 + k * 26, 976 - (k % 2) * 8, 14, p['tomato']) for k in range(3)]]
    return out


def notes(p):
    """Layered hills in the mist, a pencil drawing the path that winds through them."""
    out = sky(p, .36, .75)
    out += [C(330, 600, 70, p['sun'], op=.8)]
    layers = [
        (p['hill1'], 'M0 640C120 600 220 560 330 590C430 520 520 500 620 560C720 520 820 500 1000 560L1000 1000L0 1000Z'),
        (p['hill2'], 'M0 700C160 660 260 680 380 650C500 620 600 660 720 640C820 620 900 610 1000 630L1000 1000L0 1000Z'),
        (p['hill3'], 'M0 760C140 730 300 760 420 730C560 700 680 740 820 714C900 700 960 700 1000 704L1000 1000L0 1000Z'),
        (p['hill4'], 'M0 830C200 800 340 830 500 806C640 786 780 810 1000 780L1000 1000L0 1000Z'),
        (p['hill5'], 'M0 910C220 880 420 906 600 884C760 866 880 880 1000 870L1000 1000L0 1000Z'),
    ]
    out += [P(d, c) for c, d in layers]
    # trees along the ridges
    def pine(x, y, h, c):
        return P(f'M{num(x)} {num(y - h)}L{num(x + h * .28)} {num(y)}L{num(x - h * .28)} {num(y)}Z', c)
    rnd = random.Random(2)
    out += [pine(x, 712 + rnd.uniform(-6, 6), rnd.uniform(28, 46), p['tree1']) for x in range(560, 1000, 26)]
    out += [pine(x, 792 + rnd.uniform(-6, 6), rnd.uniform(36, 60), p['tree2']) for x in range(40, 380, 30)]
    out += [pine(x, 880 + rnd.uniform(-4, 4), rnd.uniform(50, 80), p['tree3']) for x in (600, 640, 676, 720)]
    # the path the pencil draws, from its tip back across the hills
    out += [
        P('M752 830C700 860 600 850 540 830C460 806 420 840 360 820C300 800 260 760 200 770', stroke=p['line'], width=6, op=.9),
        P('M200 770C160 776 130 750 90 752', stroke=p['line'], width=5, op=.6, cap='round'),
    ]
    # birds
    out += [P(f'M{x} {y}q10 -10 20 0q10 -10 20 0', stroke=p['bird'], width=3) for x, y in ((560, 470), (600, 440), (640, 486), (470, 520))]
    # the pencil, laid diagonally across the lower right corner
    out += [G([
        R(0, -26, 470, 52, p['pencil']),
        R(0, -26, 470, 17, p['pencil2']), R(0, 9, 470, 17, p['pencil3']),
        P('M0 -26L-90 0L0 26Z', p['wood']), P('M-62 -8L-90 0L-62 8Z', p['lead']),
        R(470, -26, 46, 52, p['ferrule']), *[L(480 + i * 12, -26, 480 + i * 12, 26, p['ferrule2'], 3) for i in range(3)],
        R(516, -26, 70, 52, p['eraser'], rx=6),
    ], tf='translate(752 830) rotate(-38)')]
    # wildflowers in the foreground
    out += grass(31, 0, 1000, 1000, p['hill4'], n=60, height=40)
    out += scatter(17, 22, (20, 930, 980, 990), lambda r, x, y: C(x, y, r.uniform(4, 7), p['flower']))
    return out


def places(p):
    """A city park: a skyline in the haze, trees, a lamp and a bench, and a pin over the lower right."""
    out = sky(p, .4, .78)
    # the skyline, two rows deep
    rnd = random.Random(6)
    x = 0
    while x < 1000:
        w = rnd.uniform(50, 90)
        h = rnd.uniform(120, 260) + (x > 500) * 60
        out.append(R(x, 780 - h, w - 6, h + 20, p['city1']))
        x += w
    x = 20
    while x < 1000:
        w = rnd.uniform(60, 100)
        h = rnd.uniform(80, 200) + (x > 600) * 80
        top = 790 - h
        out.append(R(x, top, w - 8, h + 20, p['city2']))
        out += [R(x + 8 + c * 16, top + 14 + rr * 22, 9, 12, p['window'], op=.85)
                for rr in range(int(h // 22) - 1) for c in range(int((w - 20) // 16)) if rnd.random() < .7]
        x += w + rnd.uniform(10, 40)
    out += [R(800, 420, 6, 60, p['city2']), C(803, 418, 6, p['pin'])]
    # the park
    out += [
        P('M0 800C200 780 420 800 640 776C800 760 900 764 1000 756L1000 1000L0 1000Z', p['lawn']),
        P('M0 880C240 850 460 880 700 852C840 836 920 840 1000 832L1000 1000L0 1000Z', p['lawn2']),
        P('M380 1000C440 940 560 900 700 880C800 866 900 870 1000 866L1000 900C900 900 820 904 740 916C620 934 520 960 470 1000Z', p['walk']),
    ]
    out += canopy([(90, 760, 50), (150, 740, 60), (210, 770, 44)], p['tree1'], p['tree1b'])
    out += [R(146, 780, 10, 40, p['trunk'])]
    out += canopy([(420, 790, 40), (470, 770, 50), (520, 795, 38)], p['tree1'], p['tree1b'])
    out += [R(466, 805, 9, 30, p['trunk'])]
    # the big tree on the right, reaching up the side
    out += [P('M880 1000C890 900 870 820 840 740L870 730C900 800 920 880 930 1000Z', p['trunk']),
            P('M870 790C900 760 940 740 980 730', stroke=p['trunk'], width=12),
            P('M856 760C820 730 790 700 760 690', stroke=p['trunk'], width=10)]
    out += canopy([(760, 620, 90), (880, 560, 120), (980, 640, 100), (840, 690, 80), (960, 480, 90), (820, 500, 70)], p['tree2'], p['tree2b'])
    # a lamp post and a bench
    out += [
        R(640, 760, 8, 160, p['iron']), R(628, 744, 32, 24, p['iron'], rx=4), C(644, 756, 10, p['lamp']),
        R(700, 880, 130, 12, p['bench']), R(700, 858, 130, 10, p['bench']), R(706, 892, 8, 30, p['iron']), R(816, 892, 8, 30, p['iron']),
    ]
    out += grass(41, 0, 1000, 1000, p['lawn'], n=80, height=30)
    out += scatter(19, 30, (0, 900, 1000, 990), lambda r, x, y: C(x, y, r.uniform(3, 6), p['flower']))
    # the pin
    out += [
        E(600, 902, 30, 8, p['shadow'], op=.5),
        P('M600 896C566 840 540 806 540 770A60 60 0 0 1 660 770C660 806 634 840 600 896Z', p['pin']),
        C(600, 770, 24, p['pin2']),
    ]
    return out


def travel(p):
    """A beach on the right with a palm and an umbrella, a sailboat at sea, a plane high on the right."""
    out = sky(p, .4, .7)
    out += [C(230, 640, 60, p['sun'], op=.9)]
    # clouds low on the horizon
    def cloud(x, y, s):
        return P(f'M{x} {y}h{num(200 * s)}a{num(40 * s)} {num(40 * s)} 0 0 0 -{num(50 * s)} -{num(40 * s)}a{num(56 * s)} {num(56 * s)} 0 0 0 -{num(100 * s)} -{num(10 * s)}a{num(40 * s)} {num(40 * s)} 0 0 0 -{num(50 * s)} {num(50 * s)}Z', p['cloud'])
    out += [cloud(60, 700, .9), cloud(440, 690, .6), cloud(700, 690, 1.1)]
    # the plane and its trail
    out += [
        P('M420 470C560 440 680 410 820 400', stroke=p['trail'], width=4, op=.8),
        G([P('M0 0L50 -4L58 0L50 4Z', p['plane']), P('M24 -2L14 -20L22 -20L36 -2Z', p['plane']), P('M24 2L14 20L22 20L36 2Z', p['plane']), P('M2 -1L-6 -10L0 -10L8 -1Z', p['plane'])],
          tf='translate(820 400) rotate(-6)'),
    ]
    # the sea, its waves and a sailboat
    out += [P('M0 710L1000 710L1000 1000L0 1000Z', p['sea']),
            P('M0 780L1000 760L1000 1000L0 1000Z', p['sea2'])]
    out += scatter(7, 40, (0, 720, 1000, 980), lambda r, x, y: P(f'M{num(x)} {num(y)}q10 -6 20 0q10 -6 20 0', stroke=p['wave'], width=3, op=.7))
    out += [
        P('M330 730L470 730L450 752L350 752Z', p['hull']),
        P('M400 724L400 580L470 720Z', p['sail']), P('M394 724L394 610L340 720Z', p['sail2']),
        L(398, 726, 398, 576, p['hull'], 4), P('M398 578l22 8l-22 8Z', p['flag']),
    ]
    # the beach, the palm and the umbrella
    out += [
        P('M440 1000C560 900 760 860 1000 820L1000 1000Z', p['sand']),
        P('M440 1000C560 900 760 860 1000 820', stroke=p['foam'], width=10, op=.9),
        P('M600 1000C700 940 840 910 1000 900L1000 1000Z', p['sand2']),
    ]
    out += [P('M930 900C920 800 900 700 860 560', stroke=p['palm'], width=22)]
    out += [P(f'M{930 - k * 5} {880 - k * 40}l18 -6', stroke=p['palm2'], width=4) for k in range(8)]
    out += frond(860, 560, 160, 200, 50, p['frond'], 12) + frond(860, 560, 170, -20, 60, p['frond2'], 12)
    out += frond(860, 560, 150, 240, 30, p['frond2'], 10) + frond(860, 560, 140, -60, 30, p['frond'], 10)
    out += frond(860, 560, 120, 150, 40, p['frond'], 9)
    out += [C(856, 572, 12, p['coconut']), C(872, 578, 11, p['coconut']), C(860, 588, 10, p['coconut'])]
    # umbrella: coral and white stripes, a chair under it
    cx, cy, r = 700, 840, 110
    for i in range(6):
        a0, a1 = math.pi + i * math.pi / 6, math.pi + (i + 1) * math.pi / 6
        out.append(P(f'M{cx} {cy}L{num(cx + r * math.cos(a0))} {num(cy + r * .55 * math.sin(a0))}A{r} {num(r * .55)} 0 0 1 {num(cx + r * math.cos(a1))} {num(cy + r * .55 * math.sin(a1))}Z', p['umb1'] if i % 2 else p['umb2']))
    out += [L(cx, cy - 60, cx + 10, 960, p['pole'], 6),
            P('M720 940L800 940L830 900', stroke=p['chair'], width=8), P('M730 940L760 980M790 940L770 980', stroke=p['pole'], width=5),
            E(780, 975, 70, 10, p['shadow'], op=.4)]
    out += scatter(13, 16, (620, 920, 1000, 990), lambda r, x, y: E(x, y, 4, 2, p['shell']))
    out += [G([P('M0 0l8 -18l8 18l18 0l-14 10l6 18l-18 -12l-18 12l6 -18l-14 -10Z', p['star'])], tf='translate(920 950) scale(.8)')]
    return out


def video(p):
    """A fairground at the lower right: a ferris wheel cropped by the edge, a striped tent, lights."""
    out = sky(p, .42, .8)
    out += [P('M0 860C240 840 520 856 760 836C880 826 960 830 1000 826L1000 1000L0 1000Z', p['ground'])]
    # the wheel
    cx, cy, r = 820, 640, 290
    spokes = ''.join(f'M{cx} {cy}L{num(cx + r * math.cos(math.radians(a)))} {num(cy + r * math.sin(math.radians(a)))}' for a in range(0, 360, 20))
    braces = ''.join(f'M{num(cx + r * math.cos(math.radians(a)))} {num(cy + r * math.sin(math.radians(a)))}L{num(cx + r * .82 * math.cos(math.radians(a + 20)))} {num(cy + r * .82 * math.sin(math.radians(a + 20)))}' for a in range(0, 360, 20))
    out += [
        P(f'M{cx} {cy}L{cx - 170} 1000M{cx} {cy}L{cx + 170} 1000', stroke=p['frame2'], width=20),
        C(cx, cy, r, stroke=p['frame'], width=10), C(cx, cy, r * .82, stroke=p['frame'], width=6),
        P(spokes, stroke=p['frame'], width=4), P(braces, stroke=p['frame'], width=3, op=.7),
        C(cx, cy, 36, p['frame2']), C(cx, cy, 16, p['hub']),
    ]
    for i, a in enumerate(range(10, 370, 20)):
        gx, gy = cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))
        out += [L(gx, gy, gx, gy + 18, p['frame'], 3),
                P(f'M{num(gx - 22)} {num(gy + 18)}h44v18a14 14 0 0 1 -14 14h-16a14 14 0 0 1 -14 -14Z', p['cab1'] if i % 2 else p['cab2']),
                R(gx - 22, gy + 14, 44, 8, p['roof'], rx=3)]
    out += [C(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)), 5, p['bulb']) for a in range(0, 360, 10)]
    # the tent with a pennant
    out += [
        P('M300 860L300 760L380 700L460 760L460 860Z', p['tent1']),
        *[P(f'M{300 + i * 40} 860L{300 + i * 40} 760L380 700L{320 + i * 40} 760L{320 + i * 40} 860Z', p['tent2']) for i in range(4)],
        P('M290 762L380 690L470 762Z', p['tentroof']),
        *[P(f'M{290 + i * 30} 762q15 20 30 0', p['tentroof']) for i in range(6)],
        P('M360 860L360 800A20 20 0 0 1 400 800L400 860Z', p['door']),
        L(380, 690, 380, 640, p['frame2'], 4), P('M380 640l34 10l-34 10Z', p['flag']),
    ]
    # a string of lights from the tent to the wheel
    out += [P('M380 700C460 760 540 760 620 720', stroke=p['frame2'], width=2)]
    out += [C(380 + t * 240, 700 + 4 * 46 * t * (1 - t) * 1.6 - 20 * t, 6, p['bulb2'] if i % 2 else p['bulb']) for i, t in enumerate(k / 8 for k in range(1, 8))]
    # a ticket booth and a popcorn cart, small, at the left
    out += [
        R(110, 800, 90, 70, p['booth']), P('M100 800L210 800L196 776L114 776Z', p['tent2']), R(130, 816, 50, 26, p['door']),
        R(520, 870, 60, 50, p['cab2']), P('M514 870L586 870L576 846L524 846Z', p['tent2']),
        *[C(530 + k * 10, 842 - (k % 2) * 6, 7, p['popcorn']) for k in range(5)],
        C(530, 924, 9, p['frame2']), C(574, 924, 9, p['frame2']),
    ]
    out += scatter(23, 18, (0, 880, 1000, 990), lambda r, x, y: E(x, y, 6, 2, p['ground2']))
    return out


def celebration(p):
    """Balloons rising from a stack of presents on the right, bunting across, confetti and fireworks."""
    out = sky(p, .42, .82)
    # fireworks, kept below the calm band
    def burst(x, y, r, color, n=18):
        d = ''.join(f'M{num(x + r * .3 * math.cos(a))} {num(y + r * .3 * math.sin(a))}L{num(x + r * math.cos(a))} {num(y + r * math.sin(a))}'
                    for a in (k * 2 * math.pi / n for k in range(n)))
        dots = [C(x + r * 1.12 * math.cos(a), y + r * 1.12 * math.sin(a), 3, color) for a in (k * 2 * math.pi / n for k in range(n))]
        return [P(d, stroke=color, width=3, op=.8), *dots]
    out += burst(260, 470, 70, p['fw1']) + burst(470, 400, 50, p['fw2'], 14) + burst(140, 620, 40, p['fw2'], 12)
    out += [P('M260 470L280 760', stroke=p['fw1'], width=2, op=.3)]
    out += [P('M0 880C260 860 560 876 1000 840L1000 1000L0 1000Z', p['ground'])]
    # bunting
    flags = []
    pts = [(t, 120 + 760 * t, 560 + 180 * t * (1 - t) * 1.4) for t in (k / 13 for k in range(14))]
    for i, (t, x, y) in enumerate(pts[:-1]):
        _, nx, ny = pts[i + 1]
        flags.append(P(f'M{num(x)} {num(y)}L{num(nx)} {num(ny)}L{num((x + nx) / 2)} {num((y + ny) / 2 + 48)}Z', p[('flag1', 'flag2', 'flag3')[i % 3]]))
    out += [P('M120 560Q500 760 880 560', stroke=p['string'], width=3)] + flags
    # presents at the lower right
    def present(x, y, w, h, box, ribbon):
        return [R(x, y, w, h, box), R(x - 6, y - 16, w + 12, 22, box), R(x + w / 2 - 8, y - 16, 16, h + 16, ribbon),
                P(f'M{num(x + w / 2)} {num(y - 16)}c-30 -30 -50 -6 -30 4M{num(x + w / 2)} {num(y - 16)}c30 -30 50 -6 30 4', stroke=ribbon, width=7)]
    out += present(720, 860, 150, 120, p['box1'], p['ribbon1']) + present(880, 800, 130, 180, p['box2'], p['ribbon2']) + present(640, 920, 90, 70, p['box3'], p['ribbon2'])
    # balloons rising from the presents
    balloons = [(760, 520, 52, 'b1'), (850, 440, 58, 'b2'), (930, 560, 50, 'b3'), (700, 630, 44, 'b2'), (960, 400, 46, 'b1'), (820, 640, 40, 'b3')]
    for x, y, r, c in balloons:
        out.append(P(f'M{x} {y + r * 1.2}C{x - 20} {y + r * 1.2 + 80} {x + 30} {y + 200} 800 {860 - 16}', stroke=p['string'], width=2.5))
    for x, y, r, c in balloons:
        out += [E(x, y, r, r * 1.2, p[c]), P(f'M{x - 8} {num(y + r * 1.2 + 10)}L{x} {num(y + r * 1.2 - 2)}L{x + 8} {num(y + r * 1.2 + 10)}Z', p[c]),
                E(x - r * .35, y - r * .45, r * .2, r * .32, p['shine'], op=.5, tf=f'rotate(-25 {num(x - r * .35)} {num(y - r * .45)})')]
    # confetti and streamers
    colors = [p['flag1'], p['flag2'], p['flag3'], p['b1'], p['b3']]
    out += scatter(29, 70, (0, 340, 1000, 980), lambda r, x, y: R(x, y, 14, 6, r.choice(colors), rx=2, tf=f'rotate({r.randint(0, 180)} {num(x)} {num(y)})'),
                   avoid=lambda x, y: x < 600 and y < 420)
    out += [P(f'M{x} {y}c20 -20 30 20 50 0s30 20 50 0', stroke=c, width=5) for x, y, c in ((520, 920, p['flag2']), (300, 950, p['flag1']), (80, 910, p['b3']))]
    return out


# ------------------------------------------------------------------------------------------ colours

ART = {
    'groceries': (groceries, dict(
        sky='#f4ecdb', far='#e6dcc0', ground='#ddd0ae', green1='#3e9f7f', green2='#5cb894', green3='#2b8a74', vein='#d7f0e3',
        bag='#d9b98a', bag2='#c5a171', bread='#e9b16f', bread2='#c98a4c', orange='#f2994a', apple='#ec6f5a', lemon='#f5cf5b',
        shine='#ffffff', stem='#6d5a3c', crate='#0b6e63', crate2='#12a594', crate3='#0e5c53', label='#f4ecdb', shadow='#b8a77f',
    ), dict(
        sky='#2a3a2b', far='#2f4232', ground='#344a37', green1='#2c7a63', green2='#3b8c72', green3='#21665a', vein='#5ea88d',
        bag='#7a6448', bag2='#685339', bread='#946a3c', bread2='#6f4b26', orange='#a85f2a', apple='#9c4638', lemon='#a68a37',
        shine='#ffffff', stem='#4a3c28', crate='#0a4842', crate2='#0f7266', crate3='#093c37', label='#2f4232', shadow='#1f2a20',
    )),
    'food': (food, dict(
        sky='#fadfd0', table='#f3c8b0', table2='#e8b498', steam='#ffffff', stick='#c98a5a', stick2='#b37748', noodle='#fff3dc', noodle2='#e8c894',
        bowl='#0b6e63', bowl2='#12a594', bowl3='#139a8a', broth='#f2b276', egg='#ffffff', yolk='#f6a93b', green='#4cae7c', slice='#e36f5c',
        slice2='#f39a86', sesame='#fff6e6', shadow='#d9a084', napkin='#5fc4b4', napkin2='#3fa898', dish='#ffffff', dish2='#f3e6dc', sauce='#a8492e',
    ), dict(
        sky='#3a2b29', table='#47332f', table2='#553d37', steam='#a99189', stick='#7a5233', stick2='#664328', noodle='#c9b48e', noodle2='#9e8457',
        bowl='#0f5c54', bowl2='#178074', bowl3='#14786c', broth='#8a5a32', egg='#d8d0c6', yolk='#b07422', green='#2f7a55', slice='#9a4436',
        slice2='#b0604f', sesame='#c9bba6', shadow='#271c1b', napkin='#257a6f', napkin2='#1c6359', dish='#bdb2aa', dish2='#a2968d', sauce='#5e2718',
    )),
    'music': (music, dict(
        sky='#d3ebe8', haze='#f6dcc4', glow='#fbe2cc', record='#0b6e63', groove='#12a594', shine='#7fd6c8', label='#f28a6c', label2='#f8b49c',
        sea='#5fbcb0', reflect='#f5c6a6', wave='#d7f1ec', island='#8fcfc3', note1='#0b6e63', note2='#2a8f99',
        sand='#f1dcbc', sand2='#e7caa0', dune='#7fbf9f', phones='#ec7b5e', phones2='#28323a',
    ), dict(
        sky='#2a2b48', haze='#4a3550', glow='#5a3e58', record='#0d1c26', groove='#1f5c58', shine='#2d8077', label='#b45a48', label2='#d07a62',
        sea='#1c4a55', reflect='#9a5a52', wave='#2f6a72', island='#26404f', note1='#4fbcae', note2='#7c84c4',
        sand='#3a3550', sand2='#443e5a', dune='#2f5a55', phones='#b15c46', phones2='#11151c',
    )),
    'recipes': (recipes, dict(
        sky='#fcdcc0', table='#e6a978', table2='#cf8c5c', board='#f2c48f', board2='#d9a46c', blade='#d8e4e2', handle='#0b6e63',
        plate='#ffffff', plate2='#e8dccf', cover='#0b6e63', page='#fff8ec', page2='#efdcc4', spine='#c9b08e', ink='#7a6650',
        lemon='#f6cf55', lemon2='#e6b23a', tomato='#e2563f', tomato2='#f07a62', seed='#ffe3b8', onion='#f6e7f0', basil='#2f9a74', basil2='#55b88c',
        pepper='#5a4130', herb='#12a594', whisk='#9fb3b0',
    ), dict(
        sky='#4a2c25', table='#5a352a', table2='#6a4031', board='#7a5636', board2='#654428', blade='#8a9896', handle='#0f6a5f',
        plate='#b8aca0', plate2='#988b7e', cover='#0d5b52', page='#cbbba6', page2='#ab9a84', spine='#857059', ink='#5a4a3a',
        lemon='#ad8c2c', lemon2='#8f7020', tomato='#963526', tomato2='#ad4b38', seed='#c6a483', onion='#bca5b4', basil='#21705a', basil2='#2f8a6a',
        pepper='#24170f', herb='#1b8a7a', whisk='#6c7b79',
    )),
    'notes': (notes, dict(
        sky='#d8e5ea', haze='#eadfe4', sun='#fbf0e6', hill1='#b8d3d6', hill2='#94c4c2', hill3='#6db3a9', hill4='#3e9a8a', hill5='#1f7f70',
        tree1='#7fbcb1', tree2='#3e9a8a', tree3='#14695f', line='#f6efe2', bird='#5d7f8a',
        pencil='#f2b04f', pencil2='#f7c66e', pencil3='#d9933a', wood='#f3d8b0', lead='#3a3a40', ferrule='#a9b9bb', ferrule2='#8a9ea0',
        eraser='#ef8a7a', flower='#fff3e0',
    ), dict(
        sky='#263452', haze='#3a3a5c', sun='#e6dcc8', hill1='#2d4560', hill2='#2a5160', hill3='#225a5a', hill4='#1a5450', hill5='#124540',
        tree1='#2c5468', tree2='#1d5752', tree3='#0e3c38', line='#b8b4a6', bird='#8090b0',
        pencil='#a87a32', pencil2='#bf8f44', pencil3='#8c6426', wood='#a08868', lead='#141418', ferrule='#6a7880', ferrule2='#56636a',
        eraser='#a85a50', flower='#b8c4c8',
    )),
    'places': (places, dict(
        sky='#dcefe6', haze='#f3ead8', city1='#c2e2d7', city2='#9fd2c4', window='#e4f5ef', lawn='#7cc4a4', lawn2='#5bb193', walk='#f1e5cc',
        tree1='#3f9e80', tree1b='#62b896', tree2='#12a594', tree2b='#3fc0ac', trunk='#7a6248', iron='#24524c', lamp='#fbe4a0',
        bench='#e07a5f', flower='#fff6e8', pin='#ef6f55', pin2='#ffffff', shadow='#3d8a70',
    ), dict(
        sky='#1c3a36', haze='#2c3a44', city1='#23443f', city2='#2a504a', window='#e2c77a', lawn='#1f5446', lawn2='#1a4a3d', walk='#3f4a42',
        tree1='#1a5c4b', tree1b='#22705a', tree2='#0f6e62', tree2b='#178276', trunk='#3e3228', iron='#0d1f1d', lamp='#f0cf72',
        bench='#8a4434', flower='#c9c3a8', pin='#c4543e', pin2='#f0e6d6', shadow='#0f2a24',
    )),
    'travel': (travel, dict(
        sky='#c8e9f1', haze='#f7e6cf', sun='#fff4e2', cloud='#ffffff', trail='#ffffff', plane='#ffffff',
        sea='#3fb3b0', sea2='#12a594', wave='#c9f0ea', hull='#0b6e63', sail='#ffffff', sail2='#f3e6d6', flag='#ef7c5e',
        sand='#f5dfb8', sand2='#edcf9e', foam='#ffffff', palm='#a37a52', palm2='#86603c', frond='#0b6e63', frond2='#2f9c7c', coconut='#6b4a2e',
        umb1='#ffffff', umb2='#ef7c5e', pole='#7a6248', chair='#0b6e63', shadow='#c9a974', shell='#ffffff', star='#ef9a6e',
    ), dict(
        sky='#0f3350', haze='#2c3c5c', sun='#e7e0cc', cloud='#2a4a68', trail='#5b7a96', plane='#b8c8d6',
        sea='#0f4c5c', sea2='#0b3e4c', wave='#2b6f78', hull='#0a2f36', sail='#b9c4c8', sail2='#97a4a8', flag='#b4573f',
        sand='#3d4458', sand2='#353b4e', foam='#4f7d88', palm='#4a3c34', palm2='#3a2e28', frond='#0d4a48', frond2='#14605a', coconut='#2a201a',
        umb1='#a8b4ba', umb2='#a8503c', pole='#3a3028', chair='#0f5a52', shadow='#252a3a', shell='#8a96a0', star='#a8644a',
    )),
    'video': (video, dict(
        sky='#f9e6bf', haze='#fbd2b6', ground='#efc99a', ground2='#dcb07c', frame='#0b6e63', frame2='#0e5c53', hub='#f2b04f',
        cab1='#12a594', cab2='#ef7c5e', roof='#0e5c53', bulb='#fff6d8', bulb2='#ffd46a',
        tent1='#ffffff', tent2='#ef7c5e', tentroof='#12a594', door='#0e5c53', flag='#f2b04f', booth='#5fc4b4', popcorn='#fff8e8',
    ), dict(
        sky='#3b2b3f', haze='#5a3646', ground='#2e2532', ground2='#3c3040', frame='#2c8a7e', frame2='#185e56', hub='#b8842e',
        cab1='#178a7c', cab2='#a8503c', roof='#0f4a44', bulb='#ffe8a8', bulb2='#ffc85a',
        tent1='#c8bcb0', tent2='#a8503c', tentroof='#137a6c', door='#122e2c', flag='#b8842e', booth='#2a7a70', popcorn='#e8dcc8',
    )),
    'celebration': (celebration, dict(
        sky='#fbd0c3', haze='#fde8d2', fw1='#ffffff', fw2='#12a594', ground='#f4b9a6',
        string='#a8746a', flag1='#12a594', flag2='#f2b04f', flag3='#ffffff',
        box1='#0b6e63', ribbon1='#f2b04f', box2='#ef7c5e', ribbon2='#ffffff', box3='#5fc4b4',
        b1='#12a594', b2='#ef6f5c', b3='#f6c25a', shine='#ffffff',
    ), dict(
        sky='#13353a', haze='#2a3450', fw1='#f2c25a', fw2='#4fd0bc', ground='#0f2b30',
        string='#56706e', flag1='#18897a', flag2='#b8842e', flag3='#c8c0b4',
        box1='#0d5850', ribbon1='#c99a3a', box2='#a84a3c', ribbon2='#d8d0c4', box3='#1e7a70',
        b1='#18897a', b2='#b04a3c', b3='#b8902e', shine='#ffffff',
    )),
}

HEADER = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">'
    '<!-- Notka built-in background. CC0 1.0: no rights reserved. -->'
)

if __name__ == '__main__':
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    for name, (draw, light, dark) in ART.items():
        for variant, palette in (('light', light), ('dark', dark)):
            with open(os.path.join(out_dir, f'{name}-{variant}.svg'), 'w') as f:
                f.write(HEADER + ''.join(draw(palette)) + '</svg>\n')
