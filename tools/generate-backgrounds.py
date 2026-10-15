"""Generates Notka's built-in background artwork (CC0): nine motifs, a light and a dark variant.

Every picture is 850x850 and is drawn for `background-size: cover; background-position: center`:
a narrow card shows the middle third horizontally, a wide editor the middle half vertically, so the
motif sits in the lower middle and the upper left stays a quiet tint for the note's text.
"""
import math
import os
import random
import sys

OUT = sys.argv[1]
W = 850

HEADER = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 850" width="850" height="850">'
    '<!-- Notka built-in background. CC0 1.0: no rights reserved. -->'
)


def svg(parts):
    return HEADER + ''.join(parts) + '</svg>\n'


def rect(x, y, w, h, fill, rx=0, op=1):
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}" opacity="{op}"/>'


def circle(cx, cy, r, fill, op=1):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" opacity="{op}"/>'


def path(d, fill='none', stroke=None, width=0, op=1, cap='round'):
    s = f' stroke="{stroke}" stroke-width="{width}" stroke-linecap="{cap}" stroke-linejoin="round"' if stroke else ''
    return f'<path d="{d}" fill="{fill}"{s} opacity="{op}"/>'


def hills(c1, c2, base=690):
    """Two soft ground bands across the bottom, the same in every picture."""
    return [
        path(f'M0 {base} C 200 {base-60} 420 {base+20} 850 {base-50} L850 850 L0 850 Z', c1),
        path(f'M0 {base+70} C 260 {base+20} 520 {base+110} 850 {base+50} L850 850 L0 850 Z', c2),
    ]


def specks(color, seed, n=14, area=(80, 80, 770, 560), op=0.35):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x = rnd.uniform(area[0], area[2])
        y = rnd.uniform(area[1], area[3])
        if x < 420 and y < 330:  # keep the text corner quiet
            continue
        out.append(circle(x, y, rnd.uniform(4, 10), color, op))
    return out


# --------------------------------------------------------------------------------------- motifs

def groceries(p):
    return [
        *hills(p['g1'], p['g2']),
        # basket
        path('M330 560 L520 560 L500 680 L350 680 Z', p['a']),
        path('M330 560 L520 560', stroke=p['a2'], width=10),
        path('M360 560 C 360 470 490 470 490 560', stroke=p['a2'], width=10),
        *[path(f'M{x} 575 L{x+6} 670', stroke=p['a2'], width=4, op=0.5) for x in range(365, 500, 30)],
        # produce
        circle(390, 545, 34, p['b']), circle(445, 538, 30, p['c']), circle(492, 550, 26, p['b2']),
        path('M445 508 C 455 490 470 486 482 490 C 474 502 462 508 445 508 Z', p['leaf']),
        path('M385 512 l -6 -18', stroke=p['leaf'], width=5),
        # a pear on the ground
        path('M600 700 C 570 700 565 660 585 640 C 592 620 610 620 616 640 C 636 660 632 700 600 700 Z', p['c']),
    ]


def food(p):
    return [
        *hills(p['g1'], p['g2']),
        # steam
        *[path(f'M{x} 470 C {x-18} 440 {x+18} 420 {x} 390', stroke=p['steam'], width=8, op=0.7) for x in (390, 430, 470)],
        # bowl
        path('M300 520 L560 520 C 560 600 500 650 430 650 C 360 650 300 600 300 520 Z', p['a']),
        rect(290, 508, 280, 18, p['a2'], rx=9),
        path('M360 520 C 380 490 420 490 440 510 C 460 488 500 492 515 520 Z', p['b']),
        # chopsticks
        path('M520 420 L640 600', stroke=p['c'], width=9),
        path('M545 410 L660 590', stroke=p['c'], width=9),
    ]


def music(p):
    return [
        *hills(p['g1'], p['g2']),
        # record
        circle(470, 560, 120, p['a']),
        *[circle(470, 560, r, 'none') for r in ()],
        path('M470 460 A100 100 0 0 1 570 560', stroke=p['a2'], width=4, op=0.6),
        path('M470 480 A80 80 0 0 1 550 560', stroke=p['a2'], width=3, op=0.5),
        circle(470, 560, 34, p['b']), circle(470, 560, 6, p['a']),
        # notes
        circle(330, 470, 18, p['c']), path('M346 470 L346 390 L380 380', stroke=p['c'], width=7, cap='butt'),
        circle(640, 430, 16, p['c']), circle(690, 418, 16, p['c']),
        path('M654 430 L654 360 L704 348 L704 418', stroke=p['c'], width=7, cap='butt'),
    ]


def recipes(p):
    return [
        *hills(p['g1'], p['g2']),
        # open book
        path('M300 500 C 360 480 410 490 430 510 L430 660 C 410 640 360 632 300 650 Z', p['page']),
        path('M560 500 C 500 480 450 490 430 510 L430 660 C 450 640 500 632 560 650 Z', p['page2']),
        path('M300 650 C 360 632 410 640 430 660 C 450 640 500 632 560 650 L560 668 C 500 652 450 660 430 680 C 410 660 360 652 300 668 Z', p['a']),
        *[path(f'M325 {y} C 360 {y-10} 395 {y-6} 415 {y+4}', stroke=p['line'], width=4, op=0.7) for y in (540, 565, 590, 615)],
        *[path(f'M445 {y+4} C 465 {y-6} 500 {y-10} 535 {y}', stroke=p['line'], width=4, op=0.7) for y in (540, 565, 590)],
        # wooden spoon
        path('M610 420 L660 600', stroke=p['b'], width=12),
        path('M597 380 C 590 410 620 432 634 412 C 646 392 620 360 597 380 Z', p['b']),
        # herb
        path('M250 690 C 240 640 260 600 280 580', stroke=p['leaf'], width=6),
        path('M262 620 C 240 615 232 600 236 588 C 252 592 262 604 262 620 Z', p['leaf']),
    ]


def notes(p):
    return [
        *hills(p['g1'], p['g2']),
        # sheet
        path('M330 430 L540 410 L560 660 L350 680 Z', p['page']),
        *[path(f'M{350+i*1} {470+i*38} L{540+i*1.6} {452+i*38}', stroke=p['line'], width=4, op=0.8) for i in range(5)],
        path('M372 440 L384 668', stroke=p['b'], width=3, op=0.6),
        # pencil
        path('M520 640 L660 470', stroke=p['a'], width=22, cap='butt'),
        path('M660 470 L676 450', stroke=p['a2'], width=22, cap='butt'),
        path('M512 650 L520 640 L506 660 Z', p['c'], stroke=p['c'], width=10),
    ]


def places(p):
    return [
        path('M0 640 L180 470 L330 640 Z', p['m1']), path('M200 650 L420 420 L640 650 Z', p['m2']),
        path('M420 420 L470 470 L440 470 L420 450 L400 470 L370 470 Z', p['snow']),
        *hills(p['g1'], p['g2']),
        # pin
        path('M600 640 C 560 580 540 550 540 520 A60 60 0 0 1 660 520 C 660 550 640 580 600 640 Z', p['a']),
        circle(600, 520, 22, p['b']),
        path('M600 660 m-40 0 a40 10 0 1 0 80 0 a40 10 0 1 0 -80 0', p['g2'], op=0.6),
    ]


def travel(p):
    return [
        *hills(p['g1'], p['g2']),
        # clouds
        *[path(f'M{x} {y} a28 28 0 0 1 50 -12 a34 34 0 0 1 62 8 a24 24 0 0 1 8 46 L{x} {y+42} a22 22 0 0 1 0 -42 Z', p['cloud'])
          for x, y in ((520, 420), (290, 520))],
        # trail
        path('M240 640 C 330 600 380 560 450 560 C 520 560 560 520 600 470', stroke=p['trail'], width=6, op=0.8, cap='round'),
        # paper plane
        path('M600 470 L720 400 L660 520 L640 480 Z', p['a']),
        path('M600 470 L720 400 L640 480 Z', p['a2']),
    ]


def video(p):
    return [
        *hills(p['g1'], p['g2']),
        # film strip
        path('M260 600 L600 470 L640 560 L300 690 Z', p['a']),
        *[rect(0, 0, 0, 0, '#000')],
        *[path(f'M{276+i*42} {596-i*16} l18 -7 l6 14 l-18 7 Z', p['hole']) for i in range(8)],
        *[path(f'M{300+i*42} {676-i*16} l18 -7 l6 14 l-18 7 Z', p['hole']) for i in range(8)],
        # play button
        circle(470, 470, 70, p['b']),
        path('M450 432 L506 470 L450 508 Z', p['play']),
    ]


def celebration(p):
    rnd = random.Random(7)
    confetti = []
    for _ in range(26):
        x, y = rnd.uniform(220, 780), rnd.uniform(330, 660)
        if x < 420 and y < 380:
            continue
        a = rnd.uniform(0, 180)
        confetti.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="16" height="7" rx="2" fill="{rnd.choice(p["confetti"])}" transform="rotate({a:.0f} {x:.0f} {y:.0f})"/>')
    return [
        *hills(p['g1'], p['g2']),
        *confetti,
        *[path(f'M{x} {y+60} C {x-10} {y+110} {x+14} {y+150} {x} {y+210}', stroke=p['string'], width=3)
          for x, y in ((470, 420), (560, 380), (650, 440))],
        *[path(f'M{x} {y} m-44 0 a44 54 0 1 0 88 0 a44 54 0 1 0 -88 0', c)
          for (x, y), c in zip(((470, 420), (560, 380), (650, 440)), (p['b1'], p['b2'], p['b3']))],
        *[path(f'M{x-14} {y-20} a16 22 0 0 1 14 -18', stroke='#ffffff', width=6, op=0.35)
          for x, y in ((470, 420), (560, 380), (650, 440))],
    ]


# -------------------------------------------------------------------------------------- palettes

def theme(light, dark):
    return {'light': light, 'dark': dark}


ART = {
    'groceries': (groceries, theme(
        dict(bg='#ebf0dc', g1='#d9e4c4', g2='#c8d8ae', a='#d7b48c', a2='#b98f63', b='#f19a86', b2='#f4c06b', c='#f2d779', leaf='#8db87a'),
        dict(bg='#2a3123', g1='#323b29', g2='#3a4530', a='#6b5a45', a2='#57483a', b='#8a4f45', b2='#8a6a3a', c='#8a7c45', leaf='#4e6b45'))),
    'food': (food, theme(
        dict(bg='#fbe4d8', g1='#f6d3c2', g2='#f0c2ad', a='#ec9f7d', a2='#d98463', b='#f7d77a', c='#b9805f', steam='#ffffff'),
        dict(bg='#352621', g1='#3f2d27', g2='#4a342d', a='#7c4a39', a2='#6a3e30', b='#7f6a3a', c='#5f4436', steam='#8a6e66'))),
    'music': (music, theme(
        dict(bg='#e2e5f5', g1='#d1d5ee', g2='#c1c6e6', a='#5e6299', a2='#8f93c4', b='#f3c47a', c='#7c80bf'),
        dict(bg='#25263a', g1='#2d2f46', g2='#353852', a='#14152a', a2='#4a4d75', b='#7a6440', c='#5d6198'))),
    'recipes': (recipes, theme(
        dict(bg='#fdf0d6', g1='#f8e1bd', g2='#f2d2a4', a='#d99a5b', page='#fffaf0', page2='#fff4e0', line='#e3c9a3', b='#c48f5a', leaf='#93b780'),
        dict(bg='#33291c', g1='#3d3122', g2='#473929', a='#7a5634', page='#5a4c3a', page2='#544634', line='#6f5e48', b='#6e5236', leaf='#4f6a44'))),
    'notes': (notes, theme(
        dict(bg='#e9ecf5', g1='#d8dcec', g2='#c8cee3', page='#ffffff', line='#c3cbe2', a='#f2c66d', a2='#e9a3a3', b='#e9a3a3', c='#4a4f63'),
        dict(bg='#25272f', g1='#2d3039', g2='#353943', page='#3c404c', line='#545a6b', a='#80683a', a2='#7a5050', b='#7a5050', c='#c7cbd6'))),
    'places': (places, theme(
        dict(bg='#dcefeb', g1='#bfe0d6', g2='#a4d2c4', m1='#b7d6da', m2='#9cc6cc', snow='#ffffff', a='#ef8a7c', b='#ffffff'),
        dict(bg='#1f2e2c', g1='#253835', g2='#2c423e', m1='#2a3d43', m2='#30474e', snow='#5c6f73', a='#8a4a42', b='#2a3d43'))),
    'travel': (travel, theme(
        dict(bg='#dbeaf7', g1='#c6dcef', g2='#b3cfe8', cloud='#ffffff', trail='#ffffff', a='#f4b27d', a2='#e8955c'),
        dict(bg='#1f2836', g1='#263140', g2='#2d394a', cloud='#3a4659', trail='#4c5a70', a='#8a6040', a2='#734d32'))),
    'video': (video, theme(
        dict(bg='#f5e2ef', g1='#ecd0e3', g2='#e3bfd7', a='#6f5a74', hole='#f5e2ef', b='#ec8db6', play='#ffffff'),
        dict(bg='#2f2330', g1='#382a39', g2='#423244', a='#1c151d', hole='#4a3a4c', b='#8a4a68', play='#e6d6e3'))),
    'celebration': (celebration, theme(
        dict(bg='#fde3e1', g1='#f9d0cd', g2='#f4bdb9', b1='#f28b8b', b2='#f6c86e', b3='#8ec5e6', string='#c9a3a0',
             confetti=['#f28b8b', '#f6c86e', '#8ec5e6', '#a6d39b', '#c7a6e6']),
        dict(bg='#352223', g1='#3f292a', g2='#4a3132', b1='#8a4646', b2='#86693a', b3='#3f6680', string='#6b5050',
             confetti=['#8a4646', '#86693a', '#3f6680', '#4e6b47', '#634d80']))),
}

os.makedirs(OUT, exist_ok=True)
tints = {}
for name, (draw, variants) in ART.items():
    for variant, palette in variants.items():
        body = [rect(0, 0, W, W, palette['bg'])] + specks(palette['g2'], sum(map(ord, name))) + draw(palette)
        with open(os.path.join(OUT, f'{name}-{variant}.svg'), 'w') as f:
            f.write(svg(body))
    tints[name] = (variants['light']['bg'], variants['dark']['bg'])
print(tints)
