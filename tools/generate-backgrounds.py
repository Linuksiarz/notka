"""Generates Notka's built-in background artwork (AGPL-3.0, as the rest of Notka): nine scenes, a light and a dark variant.

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

The colours are the eDuwe.pl family's: navy and its blues carry every scene,
amber is the accent, coral the warm second voice, and each scene stands on a pale sky of its own.
The dark variants are the same scenes at dusk, computed from the light ones (`dusk`); only what
gives light — a lamp, a flame, a lit window — keeps its colour.

Running it prints each scene's tint and tonal step, for `palette.css` and `docs/THEMES.md`.
"""
import colorsys
import math
import os
import random
import sys

W = 1000
CALM = 300  # above this line every picture is its flat tint
FLOOR = 850

BASE = dict(
    navy9='#042C53', navy='#0C447C', blue6='#1F6BB8', blue4='#378ADD', blue2='#85B7EB', ice='#E6F1FB',
    white='#FFFFFF', amber3='#FAC775', amber='#EF9F27', amber7='#C97F14', coral='#E8735A', coral2='#F29A85',
    red='#D9482B', red2='#B93A22', cream='#FFF4DF', cream2='#F3E2C4', kraft='#D9B98A', kraft2='#C19E6C',
    wood='#DDA869', wood2='#BF8650', wood3='#7A5234', green='#4E9F6A', green2='#7DBF7F', green3='#2F7A57',
    yellow='#F7D154', steel='#A9B8C8', copper='#D98A4B', copper2='#B96C34', bread='#E3A85E', bread2='#C2823E',
    crust='#E8B36A', crust2='#C98A42', cheese='#FFD98A', cheese2='#FFE9B5',
)
# What gives light keeps its colour at dusk.
LIT = dict(glow='#FFF1C2', flame='#FFC24A', lamp='#FFE08A')


def rgb(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return '#' + ''.join(f'{round(x + (y - x) * t):02x}' for x, y in zip(rgb(a), rgb(b)))


def dusk(color):
    """The colour as it looks after sunset: darker, a little greyer, leaning to night blue."""
    hue, light, sat = colorsys.rgb_to_hls(*(v / 255 for v in rgb(color)))
    r, g, b = colorsys.hls_to_rgb(hue, .25 + .33 * light, sat * .8)
    return mix('#' + ''.join(f'{round(v * 255):02x}' for v in (r, g, b)), '#141c33', .16)


class Palette:
    def __init__(self, sky, dark):
        self.sky, self.dark = sky, dark

    def __getitem__(self, name):
        if name == 'sky':
            return self.sky
        if name == 'floor':
            return mix(self.sky, '#000000', .2) if self.dark else mix(self.sky, BASE['navy'], .1)
        if name in LIT:
            return LIT[name]
        return dusk(BASE[name]) if self.dark else BASE[name]

    def tone(self, amount, name='navy'):
        """A quiet step away from the sky, for what stands in the distance."""
        if self.dark:
            return mix(self.sky, '#ffffff' if name == 'navy' else self[name], amount * .8)
        return mix(self.sky, BASE[name], amount)

    def window(self, lit):
        return LIT['glow'] if self.dark and lit else self['navy']


def num(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def attrs(fill=None, stroke=None, width=None, op=None, cap='round', tf=None, dash=None):
    out = []
    if fill is not None:
        out.append(f'fill="{fill}"')
    if stroke:
        out.append(f'stroke="{stroke}" stroke-width="{num(width)}" stroke-linecap="{cap}" stroke-linejoin="round"')
    if dash:
        out.append(f'stroke-dasharray="{dash}"')
    if op is not None and op < 1:
        out.append(f'opacity="{op}"')
    if tf:
        out.append(f'transform="{tf}"')
    return ' '.join(out)


def P(d, fill='none', stroke=None, width=0, op=None, cap='round', tf=None, dash=None):
    return f'<path d="{d}" {attrs(fill, stroke, width, op, cap, tf, dash)}/>'


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


def polar(cx, cy, r, degrees):
    a = math.radians(degrees)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def wedge(cx, cy, r, a0, a1, fill, op=None):
    (x0, y0), (x1, y1) = polar(cx, cy, r, a0), polar(cx, cy, r, a1)
    return P(f'M{num(cx)} {num(cy)}L{num(x0)} {num(y0)}A{num(r)} {num(r)} 0 0 1 {num(x1)} {num(y1)}Z', fill, op=op)


def shine(x, y, r, c):
    return C(x - r * .35, y - r * .35, r * .22, c['white'], op=.55)


def steam(x, y, h, c):
    return P(f'M{num(x)} {num(y)}c-18 {num(-h * .25)} 18 {num(-h * .5)} 0 {num(-h * .75)}s-14 {num(-h * .2)} 0 {num(-h * .25)}',
             stroke=c['white'], width=7, op=.6)


def star(x, y, r, fill, op=None):
    """A four-pointed sparkle."""
    k = r * .22
    return P(f'M{num(x)} {num(y - r)}Q{num(x + k)} {num(y - k)} {num(x + r)} {num(y)}Q{num(x + k)} {num(y + k)} {num(x)} {num(y + r)}'
             f'Q{num(x - k)} {num(y + k)} {num(x - r)} {num(y)}Q{num(x - k)} {num(y - k)} {num(x)} {num(y - r)}Z', fill, op=op)


def ground(c):
    return [R(0, 0, W, W, c['sky']), R(0, FLOOR, W, W - FLOOR, c['floor'])]


# ------------------------------------------------------------------------------------------ scenes

def groceries(c):
    """A full shopping cart in a supermarket aisle, the shelves rising up the right edge."""
    out = ground(c)
    # the aisle's shelves, quiet in the distance
    out.append(R(800, 350, 200, 500, c.tone(.07)))
    rnd = random.Random(5)
    for y in (450, 550, 650, 750):
        out.append(R(790, y - 8, 210, 10, c.tone(.2)))
        x = 812
        while x < 985:
            w, h = rnd.choice((22, 28, 34)), rnd.uniform(44, 76)
            fill = rnd.choice((c.tone(.14), c.tone(.22), c.tone(.4, 'coral'), c.tone(.45, 'amber3')))
            if rnd.random() < .4:
                out += [R(x, y - 8 - h * .7, w, h * .7, fill, rx=6), R(x + w / 2 - 5, y - 8 - h, 10, h * .4, fill, rx=3)]
            else:
                out.append(R(x, y - 8 - h, w, h, fill, rx=3))
            x += w + 8
    out.append(R(790, 842, 210, 10, c.tone(.2)))
    out.append(E(640, 884, 235, 12, c.tone(.2)))
    # what stands out of the cart: a paper bag with a baguette and leeks, milk, a bottle, cereal
    out += [L(505, 520, 462, 372, c['bread'], 36)]
    out += [L(480 - i * 9, 470 - i * 30, 498 - i * 9, 462 - i * 30, c['bread2'], 5) for i in range(3)]
    out += [leaf(548, 500, 190, 38, 6, c['green']), leaf(566, 500, 160, 32, 22, c['green2']), leaf(534, 500, 150, 30, -10, c['green3'])]
    out += [poly([(470, 478), (590, 470), (596, 650), (476, 650)], c['kraft']), poly([(562, 472), (590, 470), (596, 650), (568, 650)], c['kraft2'])]
    out += [poly([(612, 506), (674, 506), (662, 474), (624, 474)], c['ice']), R(612, 506, 62, 150, c['white']),
            R(612, 548, 62, 40, c['blue4']), R(635, 462, 16, 14, c['blue4'], rx=3)]
    out += [R(702, 414, 16, 72, c['green3'], rx=4), R(690, 474, 40, 180, c['green3'], rx=9), R(700, 402, 20, 16, c['amber'], rx=3),
            R(690, 536, 40, 52, c['cream'])]
    out.append(G([R(0, 0, 76, 160, c['coral'], rx=4), C(38, 62, 23, c['amber3']), R(14, 104, 48, 10, c['cream'], rx=5),
                  R(14, 122, 32, 8, c['cream'], rx=4)], tf='translate(742 486) rotate(5)'))
    out.append(P('M556 600Q610 566 664 606Q610 590 562 614Z', c['yellow']))
    for x, y, r, name in ((500, 706, 30, 'red'), (560, 720, 32, 'amber'), (626, 706, 30, 'green2'), (692, 718, 32, 'red'),
                          (746, 708, 27, 'yellow'), (530, 654, 27, 'amber'), (598, 652, 26, 'red'), (664, 656, 27, 'green'),
                          (724, 656, 25, 'amber')):
        out += [C(x, y, r, c[name]), shine(x, y, r, c)]
    # the cart itself, drawn over its load
    out.append(poly([(440, 575), (800, 575), (772, 770), (478, 770)], c['ice'], op=.22))
    for i in range(13):
        t = i / 12
        out.append(L(440 + 360 * t, 575, 478 + 294 * t, 770, c['navy'], 4))
    for y in (622, 668, 714):
        t = (y - 575) / 195
        out.append(L(440 + 38 * t, y, 800 - 28 * t, y, c['navy'], 4))
    out += [L(430, 575, 812, 575, c['navy'], 13), L(478, 770, 772, 770, c['navy'], 10),
            P('M800 575L852 520L884 520', stroke=c['navy'], width=12), L(850, 520, 886, 520, c['amber'], 17),
            P('M478 770L500 836L790 836L772 770', stroke=c['navy'], width=10)]
    for x in (522, 768):
        out += [C(x, 860, 24, c['navy9']), C(x, 860, 9, c['ice'])]
    # an orange that got away
    out += [C(400, 868, 21, c['amber']), shine(400, 868, 21, c), leaf(400, 849, 16, 9, 40, c['green'])]
    return out


def food(c):
    """A pizza seen from above on the corner of a round table, one slice already on its way."""
    out = [R(0, 0, W, W, c['sky']), C(900, 1000, 582, c['wood2']), C(900, 1000, 566, c['wood'])]
    out += [P(f'M{num(900 - r)} 1000A{r} {r} 0 0 1 900 {num(1000 - r)}', stroke=c['wood2'], width=3, op=.35) for r in (470, 370, 270)]
    # a checked napkin with the cutlery on it
    checks = [R(-56 + i * 28, -112 + j * 28, 28, 28, c['ice'], op=.22) for i in range(4) for j in range(8) if (i + j) % 2]
    out.append(G([R(-56, -112, 112, 224, c['navy'], rx=6)] + checks + [
        P('M-26 -92C-10 -80 -10 -24 -18 -2L-18 92Q-23 98 -28 92Z', c['ice']),
        R(13, -6, 10, 100, c['ice'], rx=5), R(4, -92, 6, 70, c['ice'], rx=3), R(15, -92, 6, 70, c['ice'], rx=3),
        R(26, -92, 6, 70, c['ice'], rx=3), R(4, -34, 28, 34, c['ice'], rx=10)], tf='translate(505 880) rotate(-24)'))
    # the board, then the pizza on it
    out.append(G([R(-36, -318, 72, 130, c['wood3'], rx=30), C(0, -280, 11, c['wood'])], tf='translate(750 790) rotate(8)'))
    out += [C(750, 790, 226, c['wood3']), C(750, 790, 216, c['wood2'])]
    cx, cy = 750, 790

    def toppings(parts, spots, rnd):
        for kind, x, y in spots:
            if kind == 'p':
                parts += [C(x, y, 24, c['red2']), C(x - 7, y - 6, 4.5, c['red'], op=.8), C(x + 8, y + 5, 4, c['red'], op=.8)]
            elif kind == 'o':
                parts.append(C(x, y, 8, stroke=c['navy9'], width=6))
            else:
                angle = rnd.uniform(0, 360)
                parts += [leaf(x, y, 46, 26, angle, c['green']), leaf(x, y, 40, 3, angle, c['green3'])]

    rnd = random.Random(8)
    out += [C(cx, cy, 190, c['crust']), C(cx, cy, 190, stroke=c['crust2'], width=5, op=.45), C(cx, cy, 164, c['red']), C(cx, cy, 156, c['cheese'])]
    for _ in range(16):
        x, y = polar(cx, cy, rnd.uniform(20, 128), rnd.uniform(0, 360))
        out.append(C(x, y, rnd.uniform(14, 28), c['cheese2'], op=.75))
    spots = [('p', *polar(cx, cy, d, a)) for d, a in ((0, 0), (78, 20), (82, 95), (74, 150), (126, 60), (128, 128), (124, 325), (120, 180), (84, 290))]
    spots += [('o', *polar(cx, cy, d, a)) for d, a in ((44, 58), (112, 96), (48, 190), (126, 20), (104, 300), (40, 320))]
    spots += [('b', *polar(cx, cy, d, a)) for d, a in ((118, 158), (46, 128), (100, 350), (60, 250))]
    toppings(out, spots, rnd)
    for a in (22.5, 67.5, 112.5, 157.5):
        (x0, y0), (x1, y1) = polar(cx, cy, 186, a), polar(cx, cy, 186, a + 180)
        out.append(L(x0, y0, x1, y1, c['crust2'], 3, op=.5))
    # the slice that left: the board shows through, strings of cheese still hold on
    a0, a1 = 202.5, 247.5
    out.append(wedge(cx, cy, 197, a0 - .6, a1 + .6, c['wood2']))
    dx, dy = polar(0, 0, 62, 225)
    for a in (212, 225, 238):
        (x0, y0), (x1, y1) = polar(cx, cy, 60, a), polar(cx + dx, cy + dy, 40, a)
        out.append(L(x0, y0, x1, y1, c['cheese'], 5, op=.9))
    sx, sy = cx + dx, cy + dy
    piece = [wedge(sx, sy, 190, a0, a1, c['crust']), wedge(sx, sy, 164, a0 + 2, a1 - 2, c['red']), wedge(sx, sy, 156, a0 + 3, a1 - 3, c['cheese'])]
    toppings(piece, [('p', *polar(sx, sy, 112, 228)), ('o', *polar(sx, sy, 66, 219)), ('b', *polar(sx, sy, 134, 212))], rnd)
    out += piece
    # around it: lemonade, chili oil, tomatoes and basil
    out += [C(945, 560, 60, c['ice'], op=.9), C(945, 560, 48, c['amber3']), C(928, 548, 23, c['yellow']), C(928, 548, 16, c['cream'], op=.6),
            R(950, 560, 22, 22, c['white'], op=.45, rx=4, tf='rotate(20 961 571)'), L(956, 572, 1000, 506, c['coral'], 9)]
    for x, y, r in ((640, 546, 19), (672, 520, 16), (868, 478, 18)):
        out += [C(x, y, r, c['red']), shine(x, y, r, c), leaf(x, y - r + 4, 12, 7, 30, c['green3']), leaf(x, y - r + 4, 12, 7, -40, c['green3'])]
    out += [leaf(840, 530, 44, 24, 60, c['green']), leaf(840, 530, 40, 22, 120, c['green2']), leaf(600, 566, 38, 20, -30, c['green'])]
    return out


def note(x, y, size, fill, double=False):
    parts = [E(0, 0, 13, 9.5, fill, tf='rotate(-22)'), R(9, -62, 5, 62, fill)]
    if double:
        parts += [E(46, -10, 13, 9.5, fill, tf='rotate(-22 46 -10)'), R(55, -72, 5, 62, fill), poly([(9, -62), (60, -72), (60, -57), (9, -47)], fill)]
    else:
        parts.append(P('M14 -62C30 -52 36 -40 30 -20C30 -34 24 -42 14 -46Z', fill))
    return G(parts, tf=f'translate({num(x)} {num(y)}) scale({size})')


def music(c):
    """A guitar leaning on an amplifier, a record out of its sleeve, the notes rising up the right."""
    out = ground(c)
    out += [P(f'M{860 - r} 700A{r} {r} 0 0 1 860 {700 - r}', stroke=c.tone(.1), width=12) for r in (200, 265, 330)]
    out.append(E(690, 884, 300, 12, c.tone(.2)))
    # the record and its sleeve
    out.append(G([C(46, -6, 100, c['navy9'])] + [C(46, -6, r, stroke=c['blue6'], width=2, op=.7) for r in (86, 72, 58)] + [
        C(46, -6, 36, c['amber']), C(46, -6, 6, c['navy9']),
        R(-108, -108, 216, 216, c['coral'], rx=6), C(0, 0, 66, c['amber3']), C(0, 0, 40, c['coral2']), C(0, 0, 14, c['navy'])],
        tf='translate(672 760) rotate(-7)'))
    # the amplifier, a metronome and two cassettes on it
    out += [R(790, 566, 84, 24, c['coral'], rx=3), R(798, 544, 70, 22, c['amber3'], rx=3), R(812, 550, 42, 10, c['cream'], rx=5),
            poly([(900, 590), (960, 590), (942, 492), (918, 492)], c['wood3']), L(930, 584, 950, 508, c['ice'], 4), R(936, 524, 16, 12, c['amber'], rx=2)]
    out += [R(760, 590, 222, 272, c['navy9'], rx=14), R(774, 604, 194, 52, c['navy'], rx=8), R(778, 668, 186, 180, c['navy'], rx=8),
            C(871, 758, 76, c['navy9']), C(871, 758, 62, c['blue6'], op=.55), C(871, 758, 25, c['navy9']), C(863, 750, 7, c['blue2'], op=.6),
            R(774, 862, 30, 10, c['navy9'], rx=3), R(938, 862, 30, 10, c['navy9'], rx=3)]
    for i in range(5):
        out += [C(800 + i * 36, 630, 10, c['amber']), L(800 + i * 36, 630, 800 + i * 36 + (i - 2) * 3, 621, c['navy9'], 3)]
    # the guitar
    body = [E(0, 0, 112, 102, c['amber7']), E(0, -128, 84, 80, c['amber7']), R(-66, -104, 132, 76, c['amber7']),
            E(0, 0, 102, 92, c['amber']), E(0, -128, 74, 70, c['amber']), R(-58, -106, 116, 82, c['amber']),
            P('M34 -64C74 -54 84 -8 54 22C44 -8 38 -36 34 -64Z', c['coral']),
            C(0, -76, 40, stroke=c['wood3'], width=4), C(0, -76, 32, c['navy9']), R(-40, 22, 80, 14, c['navy9'], rx=4),
            R(-14, -402, 28, 300, c['wood3'])]
    body += [L(-14, y, 14, y, c['amber3'], 2) for y in range(-392, -130, 28)]
    body.append(poly([(-22, -400), (22, -400), (27, -470), (-27, -470)], c['navy9']))
    body += [C(side * 35, -416 - i * 20, 7, c['ice']) for side in (-1, 1) for i in range(3)]
    body += [L(-10 + i * 4, -462, -15 + i * 6, 28, c['cream'], 1.6, op=.9) for i in range(6)]
    out.append(G(body, tf='translate(530 770) rotate(10)'))
    # headphones on the floor
    out += [P('M336 874A48 48 0 0 1 432 874', stroke=c['navy9'], width=10), R(323, 852, 26, 44, c['coral'], rx=10), R(419, 852, 26, 44, c['coral'], rx=10)]
    out += [note(820, 480, 1.5, c['navy']), note(880, 420, 1.35, c['blue4'], True), note(742, 426, 1.2, c['amber']),
            note(950, 548, 1.2, c['coral']), note(800, 350, 1.0, c['blue6'])]
    return out


def recipes(c):
    """A kitchen counter mid-recipe: the open book, the board, a pot on the boil, the rail above."""
    out = [R(0, 0, W, W, c['sky'])]
    out += [L(x, 400, x, 770, c.tone(.06), 2) for x in range(20, 1001, 70)]
    out += [L(0, y, 1000, y, c.tone(.06), 2) for y in range(400, 771, 74)]
    out += [R(0, 770, W, 34, c['cream']), R(0, 800, W, 6, c['cream2']), R(0, 806, W, 194, c['navy'])]
    for x in (30, 280, 530, 780):
        out += [R(x, 828, 226, 150, c['blue6'], op=.4, rx=6), R(x + 92, 842, 42, 8, c['amber'], rx=4)]
    # the rail and what hangs from it
    out.append(L(560, 430, 1000, 430, c['navy9'], 8))
    out += [P(f'M{x} 420a8 8 0 0 1 0 16', stroke=c['navy9'], width=4) for x in (620, 692, 762, 850, 946)]
    out += [L(620, 436, 620, 566, c['steel'], 7), P('M594 566A26 26 0 0 0 646 566Z', c['steel'])]
    out.append(L(692, 436, 692, 506, c['wood3'], 10))
    out += [P(f'M692 506C{692 + dx * 1.7} 546 {692 + dx * 1.7} 586 692 616', stroke=c['steel'], width=3) for dx in (-18, -9, 0, 9, 18)]
    out += [L(762, 436, 762, 536, c['wood3'], 10), R(743, 536, 38, 74, c['coral'], rx=7)]
    out += [R(751 + i * 9, 550, 4, 40, c['sky'], rx=2) for i in range(3)]
    out += [L(850, 436, 850, 524, c['wood3'], 11), C(850, 580, 60, c['copper']), C(850, 580, 48, c['copper2'])]
    out.append(L(946, 436, 946, 470, c['kraft2'], 3))
    out += [leaf(946, 466, 100, 26, a, c[name]) for a, name in ((180, 'green'), (163, 'green2'), (197, 'green3'), (148, 'green'), (212, 'green2'))]
    out.append(R(934, 462, 24, 10, c['kraft2'], rx=3))
    # the cookbook on its stand
    out += [poly([(408, 648), (482, 660), (482, 760), (408, 748)], c['cream']), poly([(482, 660), (556, 648), (556, 748), (482, 760)], c['cream2']),
            poly([(418, 664), (472, 673), (472, 708), (418, 699)], c['coral2'])]
    out += [L(418, 712 + i * 12, 470, 720 + i * 12, c['navy'], 3, op=.5) for i in range(3)]
    out += [L(494, 676 + i * 13, 546 - (i % 3) * 8, 668 + i * 13, c['navy'], 3, op=.5) for i in range(6)]
    out += [R(398, 754, 168, 10, c['wood3'], rx=3), poly([(470, 764), (494, 764), (500, 770), (464, 770)], c['wood3'])]
    # the board: tomatoes, a lemon, chopped herbs, the knife
    out.append(R(584, 752, 252, 18, c['wood'], rx=7))
    out += [C(626, 727, 26, c['red']), shine(626, 727, 26, c), leaf(626, 703, 14, 8, 35, c['green3']), leaf(626, 703, 14, 8, -35, c['green3']),
            P('M660 752A25 25 0 0 1 710 752Z', c['red']), P('M667 752A18 18 0 0 1 703 752Z', c['coral2']),
            P('M716 752A19 19 0 0 1 754 752Z', c['yellow']), P('M722 752A13 13 0 0 1 748 752Z', c['cream'])]
    rnd = random.Random(4)
    out += [E(rnd.uniform(596, 612), rnd.uniform(742, 750), 5, 2.5, c['green'], tf=None) for _ in range(6)]
    out += [poly([(762, 750), (812, 750), (812, 737), (776, 737)], c['steel']), R(810, 736, 46, 14, c['navy9'], rx=5)]
    # the pot
    out += [steam(896, 612, 90, c), steam(934, 606, 110, c), R(866, 766, 100, 6, c['wood3'], rx=2),
            R(838, 692, 20, 12, c['navy9'], rx=4), R(972, 692, 20, 12, c['navy9'], rx=4), R(856, 660, 118, 106, c['coral'], rx=12),
            R(850, 654, 130, 14, c['coral2'], rx=7), R(870, 690, 12, 56, c['coral2'], op=.6, rx=6)]
    out.append(G([P('M-64 0A64 24 0 0 1 64 0Z', c['coral2']), C(0, -26, 9, c['navy9'])], tf='translate(908 648) rotate(-13)'))
    return out


def notes(c):
    """A writing desk in the evening: a typewriter with a page in it, a lamp, notes pinned above."""
    out = [R(0, 0, W, W, c['sky'])]
    for x, y, name, turn in ((560, 356, 'amber3', -6), (654, 342, 'coral2', 5), (748, 368, 'blue2', -3), (602, 452, 'ice', 4), (700, 458, 'amber3', 8)):
        lines = [L(12, 30 + i * 14, 66 - (i % 2) * 18, 30 + i * 14, c['navy'], 3, op=.45) for i in range(3)]
        out.append(G([R(0, 0, 80, 80, c[name], rx=3)] + lines + [C(40, 9, 5.5, c['coral' if name != 'coral2' else 'navy'])],
                     tf=f'translate({x} {y}) rotate({turn})'))
    out += [R(0, 800, W, 26, c['wood']), R(0, 826, W, 174, c['wood3']), R(690, 848, 270, 122, c['wood2'], op=.45, rx=6), C(825, 909, 9, c['amber'])]
    # the lamp's light, under everything it falls on
    out.append(poly([(868, 522), (940, 575), (806, 800), (500, 800)], c['lamp'], op=.3))
    # books, glasses on top
    out += [R(376, 760, 172, 40, c['navy'], rx=4), R(388, 770, 30, 20, c['amber3'], rx=2), R(388, 724, 150, 36, c['coral'], rx=4),
            R(500, 724, 10, 36, c['cream']), R(380, 692, 160, 32, c['blue4'], rx=4), R(394, 700, 60, 8, c['ice'], rx=4),
            C(436, 676, 15, stroke=c['navy9'], width=4), C(484, 676, 15, stroke=c['navy9'], width=4), L(451, 676, 469, 676, c['navy9'], 4)]
    # the typewriter: the page first, then the machine in front of it
    out.append(R(610, 436, 152, 214, c['white'], rx=3))
    widths = (112, 96, 118, 84, 108, 100, 60)
    out += [L(628, 466 + i * 22, 628 + w, 466 + i * 22, c['navy'], 5, op=.65) for i, w in enumerate(widths[:-1])]
    out += [L(628, 598, 628 + widths[-1], 598, c['navy'], 5, op=.65), C(704, 598, 4.5, c['amber']), C(718, 598, 3.5, c['amber'])]
    out += [L(792, 632, 828, 602, c['steel'], 6), C(828, 602, 8, c['steel']), R(566, 628, 240, 22, c['navy9'], rx=11),
            P('M586 650L786 650L814 800L558 800Z', c['navy']), R(598, 652, 176, 42, c['blue6'], rx=6),
            P('M622 692A64 38 0 0 1 750 692', stroke=c['navy9'], width=6)]
    for y, n, x0, x1 in ((722, 9, 594, 778), (752, 10, 586, 786)):
        out += [C(x0 + (x1 - x0) * i / (n - 1), y, 9.5, c['ice']) for i in range(n)]
    out.append(R(628, 776, 116, 10, c['ice'], rx=5))
    # a mug, and the lamp
    out += [steam(850, 736, 70, c), P('M878 756a17 17 0 0 1 0 32', stroke=c['coral'], width=8), R(822, 742, 58, 58, c['coral'], rx=8)]
    out += [E(945, 800, 52, 11, c['navy9']), P('M945 795L900 600L960 480', stroke=c['navy9'], width=10), C(900, 600, 10, c['amber']),
            poly([(950, 455), (985, 482), (940, 575), (868, 522)], c['navy']), E(904, 548, 46, 12, c['lamp'], tf='rotate(36 904 548)')]
    return out


def house(c, x, w, h, wall, roof, kind, rnd, shop=False):
    top = FLOOR - h
    parts = [R(x, top, w, h, c[wall])]
    if kind == 0:
        parts.append(poly([(x - 4, top), (x + w + 4, top), (x + w / 2, top - w * .55)], c[roof]))
    elif kind == 1:
        step = w * .15
        parts += [R(x + i * step, top - (i + 1) * step, w - 2 * i * step, step + 1, c[wall]) for i in range(3)]
        parts += [R(x + i * step - 3, top - (i + 1) * step - 5, w - 2 * i * step + 6, 6, c[roof]) for i in range(3)]
    elif kind == 2:
        parts += [P(f'M{num(x)} {num(top)}C{num(x)} {num(top - w * .6)} {num(x + w)} {num(top - w * .6)} {num(x + w)} {num(top)}Z', c[wall]),
                  C(x + w / 2, top - w * .14, w * .1, c.window(True))]
    else:
        parts.append(R(x - 5, top - 12, w + 10, 14, c[roof]))
    columns = 2 if w < 112 else 3
    for floor in range(int((h - 96) / 68)):
        y = top + 22 + floor * 68
        for k in range(columns):
            wx = x + w * (k + .5) / columns - 13
            parts += [R(wx, y, 26, 40, c.window(rnd.random() < .55), rx=3), L(wx + 13, y + 2, wx + 13, y + 38, c[wall], 2),
                      R(wx - 4, y + 40, 34, 5, c['cream'], rx=2)]
    if shop:
        stripe = (w - 8) / 6
        parts += [R(x + 10, FLOOR - 66, w - 20, 66, c['navy9'], rx=4), R(x + 16, FLOOR - 58, w - 32, 36, c.window(True), rx=3)]
        parts += [R(x + 4 + i * stripe, FLOOR - 92, stripe, 26, c['coral' if i % 2 else 'cream']) for i in range(6)]
    else:
        parts += [R(x + w / 2 - 16, FLOOR - 62, 32, 62, c['navy9'], rx=14), R(x + w / 2 - 16, FLOOR - 30, 32, 30, c['navy9']),
                  C(x + w / 2 + 8, FLOOR - 28, 2.5, c['amber'])]
    return parts


def places(c):
    """A row of old-town houses climbing to a clock tower, a pin dropped on one of them."""
    out = ground(c)
    out.append(poly([(330, 850), (330, 640), (372, 600), (414, 640), (414, 610), (470, 610), (470, 560), (505, 520), (540, 560), (540, 600), (620, 600),
                     (620, 540), (700, 540), (700, 500), (760, 450), (820, 500), (820, 560), (900, 560), (900, 480), (1000, 480), (1000, 850)], c.tone(.09)))
    rnd = random.Random(12)
    for x in range(0, 1000, 46):
        out.append(E(x + rnd.uniform(0, 30), rnd.uniform(872, 985), 16, 5, c.tone(.2), op=.6))
    out += [R(940, 420, 80, 430, c['blue4']), poly([(934, 420), (1000, 420), (1000, 330), (978, 304)], c['navy']), C(978, 500, 24, c['cream']),
            L(978, 500, 978, 484, c['navy9'], 3), L(978, 500, 990, 506, c['navy9'], 3), R(962, 560, 30, 46, c.window(True), rx=15),
            R(962, 650, 30, 46, c.window(False), rx=15)]
    for x, w, h, wall, roof, kind, shop in ((396, 106, 236, 'cream', 'coral', 0, False), (502, 122, 322, 'coral2', 'navy', 1, True),
                                           (624, 104, 268, 'amber3', 'coral', 2, False), (728, 126, 356, 'blue2', 'navy', 0, False),
                                           (854, 90, 292, 'ice', 'amber7', 3, False)):
        out += house(c, x, w, h, wall, roof, kind, rnd, shop)
    # the street: a lamp, a tree in a planter, a cafe table
    out += [L(712, 850, 712, 748, c['navy9'], 6), R(700, 728, 24, 26, c['lamp'], rx=5), R(696, 722, 32, 8, c['navy9'], rx=3)]
    out += [R(840, 822, 44, 28, c['wood3'], rx=4), L(862, 822, 862, 780, c['wood3'], 6), C(862, 752, 34, c['green3']), C(850, 742, 22, c['green'])]
    out += [L(470, 850, 470, 816, c['navy9'], 4), E(470, 814, 26, 5, c['navy9']), R(432, 826, 16, 24, c['coral'], rx=3), R(492, 826, 16, 24, c['coral'], rx=3)]
    out += [P('M563 478C528 428 516 408 516 386A47 47 0 1 1 610 386C610 408 598 428 563 478Z', c['coral']), C(563, 386, 18, c['cream']),
            E(563, 492, 16, 4, c['navy9'], op=.25)]
    out += [P(f'M{x} {y}q9 -9 18 0q9 -9 18 0', stroke=c['navy'], width=3, op=.5) for x, y in ((790, 380), (840, 350), (690, 410))]
    return out


def travel(c):
    """Packed and ready: suitcases stacked by a globe, mountains behind, a plane already on its way."""
    out = [R(0, 0, W, W, c['sky']), C(610, 590, 74, c['glow'], op=.75),
           poly([(360, 850), (520, 650), (590, 720), (720, 540), (850, 730), (930, 640), (1000, 700), (1000, 850)], c.tone(.12)),
           poly([(720, 540), (756, 590), (734, 584), (716, 602), (694, 578)], c['white'], op=.6),
           poly([(300, 850), (430, 730), (520, 790), (640, 700), (780, 800), (900, 740), (1000, 790), (1000, 850)], c.tone(.2)),
           R(0, FLOOR, W, W - FLOOR, c['floor']), E(720, 884, 300, 12, c.tone(.22))]
    out.append(P('M440 590C500 440 610 540 690 450S800 340 866 372', stroke=c['navy'], width=5, op=.55, dash='2 16'))
    out.append(G([poly([(-4, 0), (-28, -42), (-10, -42), (18, 0)], c['blue6']), poly([(-4, 0), (-28, 42), (-10, 42), (18, 0)], c['blue6']),
                  poly([(-44, 0), (-58, -22), (-46, -22), (-32, 0)], c['blue6']), P('M-48 0C-48 -10 30 -12 48 0C30 12 -48 10 -48 0Z', c['navy'])],
                 tf='translate(904 356) rotate(-22)'))
    # the upright case
    out += [P('M470 620L470 556L532 556L532 620', stroke=c['steel'], width=7), R(444, 620, 114, 232, c['blue4'], rx=14)]
    out += [L(472 + i * 29, 640, 472 + i * 29, 832, c['blue6'], 5) for i in range(3)]
    out += [C(466, 860, 10, c['navy9']), C(536, 860, 10, c['navy9'])]
    # the stack: trunk, case, vanity case, a hat and a camera on top
    out += [R(580, 690, 362, 172, c['navy'], rx=16), R(650, 690, 26, 172, c['amber']), R(846, 690, 26, 172, c['amber']),
            R(652, 762, 22, 28, c['amber7'], rx=4), R(848, 762, 22, 28, c['amber7'], rx=4)]
    out += [R(x, y, 26, 26, c['navy9'], rx=8) for x in (580, 916) for y in (690, 836)]
    out += [C(760, 756, 32, c['coral']), star(760, 756, 20, c['cream']), R(700, 806, 74, 36, c['cream'], rx=4, tf='rotate(-6 737 824)'),
            L(712, 820, 760, 816, c['navy'], 3, op=.5), C(806, 818, 21, c['amber3']), C(806, 818, 12, c['blue4'])]
    out += [R(615, 585, 282, 105, c['coral'], rx=14), R(615, 628, 282, 14, c['coral2']), R(662, 618, 22, 32, c['cream'], rx=3), R(828, 618, 22, 32, c['cream'], rx=3)]
    out += [R(660, 505, 182, 80, c['amber3'], rx=12), R(660, 536, 182, 10, c['cream']), R(742, 528, 18, 26, c['navy'], rx=3)]
    out += [E(750, 505, 98, 13, c['kraft']), P('M704 503C704 452 796 452 796 503Z', c['kraft']), P('M705 494Q750 482 795 494L795 503L705 503Z', c['navy'])]
    out += [R(852, 552, 46, 33, c['navy9'], rx=5), R(858, 545, 13, 9, c['navy9'], rx=2), C(876, 569, 12, c['blue2']), C(876, 569, 6, c['navy'])]
    # the globe
    out += [E(966, 854, 36, 7, c['wood3']), R(961, 820, 10, 34, c['wood3']), P('M906 778A62 62 0 0 0 990 826', stroke=c['wood3'], width=6),
            C(962, 766, 54, c['blue4']), P('M930 740C950 722 972 730 968 748C990 752 986 776 966 772C956 790 934 782 940 764C926 760 922 748 930 740Z', c['green2']),
            P('M980 786C992 780 1006 790 1000 802C990 808 978 800 980 786Z', c['green2']), shine(962, 766, 54, c)]
    return out


def video(c):
    """A night at the pictures: popcorn, a clapperboard, a reel whose film curls up the right side."""
    out = ground(c)
    out += [star(x, y, r, c['amber3' if i % 2 else 'white'], op=.9) for i, (x, y, r) in enumerate(
        ((600, 380, 16), (700, 340, 11), (780, 420, 20), (640, 500, 10), (840, 330, 13), (540, 450, 9), (745, 520, 12)))]
    out.append(E(680, 884, 320, 12, c.tone(.2)))
    # the film, behind the reel it runs off
    film = 'M915 700C1016 600 800 540 884 440S996 384 950 318'
    out += [P(film, stroke=c['navy9'], width=48, cap='butt'), P(film, stroke=c['blue2'], width=24, cap='butt', dash='24 14'),
            P(film, stroke=c['ice'], width=3, cap='butt', dash='5 8', tf='translate(-19 0)', op=.7),
            P(film, stroke=c['ice'], width=3, cap='butt', dash='5 8', tf='translate(19 0)', op=.7)]
    out += [C(915, 765, 96, c['navy9']), C(915, 765, 87, stroke=c['blue6'], width=3)]
    out += [C(*polar(915, 765, 53, k * 72 - 90), 22, c['sky']) for k in range(5)]
    out += [C(915, 765, 15, c['amber']), C(915, 765, 5, c['navy9'])]
    # a soda
    out += [L(650, 630, 670, 540, c['navy'], 9), poly([(600, 642), (686, 642), (674, 862), (612, 862)], c['coral']),
            poly([(604, 720), (682, 720), (679, 770), (607, 770)], c['cream'], op=.55), R(592, 628, 102, 16, c['cream'], rx=7)]
    # the popcorn
    blobs = [(722, 640, 22), (756, 628, 24), (792, 622, 26), (830, 628, 24), (862, 640, 22), (740, 604, 22), (776, 592, 24), (814, 592, 24),
             (848, 606, 21), (760, 566, 21), (796, 558, 23), (830, 568, 20), (786, 530, 18), (700, 560, 15), (880, 548, 15), (850, 500, 14), (742, 492, 13)]
    for x, y, r in blobs:
        out += [C(x, y, r, c['cream']), C(x + r * .3, y + r * .3, r * .45, c['amber3'], op=.7)]
    top, bottom = (700, 884), (728, 856)
    for i in range(6):
        a, b = i / 6, (i + 1) / 6
        out.append(poly([(top[0] + (top[1] - top[0]) * a, 650), (top[0] + (top[1] - top[0]) * b, 650),
                         (bottom[0] + (bottom[1] - bottom[0]) * b, 862), (bottom[0] + (bottom[1] - bottom[0]) * a, 862)], c['cream' if i % 2 else 'navy']))
    out += [R(692, 642, 200, 16, c['navy'], rx=8), C(792, 760, 36, c['amber']), star(792, 760, 24, c['cream'])]
    # the clapperboard
    stripes = lambda y: [poly([(8 + i * 42, y), (30 + i * 42, y), (18 + i * 42, y + 30), (-4 + i * 42, y + 30)], c['ice']) for i in range(5)]
    out.append(G([R(0, 0, 212, 142, c['navy9'], rx=8), L(14, 48, 198, 48, c['ice'], 3, op=.5), L(14, 94, 198, 94, c['ice'], 3, op=.5),
                  L(106, 48, 106, 142, c['ice'], 3, op=.5), L(24, 26, 96, 26, c['ice'], 5, op=.8), L(24, 72, 80, 72, c['ice'], 5, op=.8),
                  L(122, 72, 176, 72, c['ice'], 5, op=.8), L(24, 118, 70, 118, c['amber3'], 5), R(0, -34, 212, 30, c['navy9'], rx=4)] + stripes(-34)
                 + [G([R(0, -66, 212, 30, c['navy9'], rx=4)] + stripes(-66) + [C(10, -38, 6, c['amber'])], tf='rotate(-15 0 -36)')],
                 tf='translate(398 720)'))
    # two tickets
    for x, y, turn, name in ((874, 892, -8, 'amber'), (902, 918, 6, 'amber3')):
        out.append(G([R(0, 0, 112, 46, c[name], rx=6), C(0, 23, 8, c['floor']), C(112, 23, 8, c['floor']),
                      L(32, 6, 32, 40, c['navy'], 2, op=.5), star(70, 23, 13, c['cream'])], tf=f'translate({x} {y}) rotate({turn})'))
    return out


def celebration(c):
    """A birthday table: the cake with its candles lit, presents, balloons up the right side."""
    out = ground(c)
    rnd = random.Random(21)
    names = ('navy', 'blue4', 'amber', 'coral', 'blue2', 'amber3')
    for _ in range(170):
        x, y = rnd.uniform(380, 1000), rnd.uniform(320, 838)
        if rnd.random() < .1 + .9 * (x - 380) / 620:
            out.append(R(x, y, 11, 5, c[rnd.choice(names)], rx=1, op=.85, tf=f'rotate({rnd.randint(0, 180)} {num(x)} {num(y)})'))
    # bunting
    out.append(P('M380 392Q590 520 800 372', stroke=c['navy9'], width=3))
    for i in range(1, 9):
        t = i / 9
        x = (1 - t) ** 2 * 380 + 2 * (1 - t) * t * 590 + t * t * 800
        y = (1 - t) ** 2 * 392 + 2 * (1 - t) * t * 520 + t * t * 372
        out.append(poly([(x - 17, y - 2), (x + 17, y - 2), (x, y + 40)], c[names[i % 4]]))
    # balloons, tied to the big present
    for x, y, r, name in ((884, 416, 58, 'blue4'), (954, 500, 52, 'amber'), (812, 496, 50, 'coral'), (902, 566, 44, 'navy')):
        out += [P(f'M{x} {y + r * 1.15}Q{x - 10} {(y + 745) / 2} 914 745', stroke=c['navy9'], width=2, op=.6),
                E(x, y, r, r * 1.15, c[name]), poly([(x - 7, y + r * 1.15 + 9), (x + 7, y + r * 1.15 + 9), (x, y + r * 1.15 - 2)], c[name]),
                E(x - r * .35, y - r * .4, r * .16, r * .28, c['white'], op=.5, tf=f'rotate(20 {num(x - r * .35)} {num(y - r * .4)})')]
    out.append(E(700, 884, 300, 12, c.tone(.2)))
    # presents
    out += [R(850, 745, 132, 117, c['navy'], rx=6), R(905, 745, 22, 117, c['amber']), R(850, 792, 132, 18, c['amber']),
            E(898, 738, 21, 12, c['amber'], tf='rotate(-24 898 738)'), E(934, 738, 21, 12, c['amber'], tf='rotate(24 934 738)'), C(916, 742, 8, c['amber7']),
            R(790, 800, 70, 62, c['coral'], rx=5), R(818, 800, 14, 62, c['cream']), R(790, 824, 70, 12, c['cream'])]
    # the cake on its stand
    out += [E(640, 866, 62, 9, c['blue2']), poly([(626, 822), (654, 822), (670, 866), (610, 866)], c['blue2']), E(640, 814, 152, 15, c['ice'])]
    out += [R(525, 690, 230, 120, c['blue4'], rx=10), R(525, 686, 230, 26, c['cream'], rx=11)]
    out += [R(x, 700, 16, 16 + (i * 37) % 30, c['cream'], rx=8) for i, x in enumerate(range(538, 742, 26))]
    out += [C(545 + i * 38, 772 + (i % 2) * 14, 5, c['amber3' if i % 2 else 'ice']) for i in range(6)]
    out += [R(570, 590, 140, 100, c['coral'], rx=10), R(570, 586, 140, 22, c['cream'], rx=10)]
    out += [R(x, 598, 15, 14 + (i * 29) % 24, c['cream'], rx=7.5) for i, x in enumerate(range(580, 700, 24))]
    out += [C(584 + i * 28, 664, 4.5, c['cream']) for i in range(5)]
    for i, x in enumerate((598, 624, 650, 676)):
        out += [C(x, 536, 18, c['glow'], op=.4), R(x - 4, 548, 8, 40, c['amber3' if i % 2 else 'blue2'], rx=2),
                P(f'M{x} 518C{x + 9} 532 {x + 7} 546 {x} 546C{x - 7} 546 {x - 9} 532 {x} 518Z', c['flame'])]
    # a party hat that somebody took off
    out += [poly([(428, 868), (502, 868), (465, 766)], c['amber']), poly([(441, 832), (489, 832), (482, 812), (448, 812)], c['navy']),
            C(465, 764, 10, c['coral']), E(465, 868, 37, 6, c['amber7'])]
    return out


# name -> (scene, the light sky, the dark sky)
ART = {
    'groceries': (groceries, '#eef2e2', '#24332c'),
    'food': (food, '#fbe3d2', '#382a2b'),
    'music': (music, '#e3e4f7', '#27284a'),
    'recipes': (recipes, '#f6ecd6', '#33302a'),
    'notes': (notes, '#dde8f3', '#1d2e4c'),
    'places': (places, '#fbe6c8', '#2c2a47'),
    'travel': (travel, '#cfe8f3', '#0f3350'),
    'video': (video, '#f7dadf', '#3a2638'),
    'celebration': (celebration, '#fcebc0', '#2e2a3e'),
}

HEADER = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">'
    '<!-- Notka built-in background. AGPL-3.0-only, see LICENSE. -->'
)


def tonal(sky, dark):
    """The lighter step of a tint that the phone editor's buttons stand on."""
    return mix(sky, '#ffffff', .14 if dark else .5)


if __name__ == '__main__':
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    for name, (draw, light, dark) in ART.items():
        for variant, sky in (('light', light), ('dark', dark)):
            with open(os.path.join(out_dir, f'{name}-{variant}.svg'), 'w') as f:
                f.write(HEADER + ''.join(draw(Palette(sky, variant == 'dark'))) + '</svg>\n')
        print(f'{name}: tint {light} / {dark}, tonal {tonal(light, False)} / {tonal(dark, True)}')
