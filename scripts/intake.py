#!/usr/bin/env python3
"""Transcript intake for Inflekt OS (runs in GitHub Actions; stdlib only).

  python3 intake.py prepare <data-repo-root> <work-dir>
      - reads new files in intake/ (any recorder / uploader drops a transcript there)
      - de-duplicates: three people recording the same call = ONE meeting
      - writes one prompt file per new meeting into <work-dir>   (prints  queued=N  for the workflow)
  python3 intake.py finish <data-repo-root> <work-dir>
      - reads Claude's replies (<work-dir>/<id>.out) and files them as pending review in data/inbox.json
      - deletes processed / duplicate raw transcripts (only a fingerprint is kept)

Transcript file format (all header lines optional, then a blank line, then the text):
    Title: Wooden Street intro call
    Start: 2026-11-20T15:00        (local time; or put it in the file name: 2026-11-20_1500_name.txt)
    Lead: Wooden Street
    Track: Wooden Street
    Recorder: Anand
"""
import json, os, re, sys, zlib, hashlib, datetime

EXT = ('.txt', '.md', '.vtt', '.srt', '.json')


def jload(p, default):
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def jsave(p, data):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)


def now_iso():
    return datetime.datetime.now().strftime('%Y-%m-%dT%H:%M')


def parse_start(s):
    if not s:
        return None
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})[T_ -]?(\d{2})?[:.]?(\d{2})?', s)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    h, mi = int(m.group(4) or 0), int(m.group(5) or 0)
    try:
        return datetime.datetime(y, mo, d, h, mi)
    except ValueError:
        return None


def read_transcript(path, rel):
    raw = open(path, encoding='utf-8', errors='replace').read()
    meta, body = {}, raw
    lines = raw.split('\n')
    i = 0
    while i < len(lines) and re.match(r'^(Title|Start|Lead|Track|Recorder|Source):', lines[i], re.I):
        k, v = lines[i].split(':', 1)
        meta[k.strip().lower()] = v.strip()
        i += 1
    if meta:
        body = '\n'.join(lines[i:]).lstrip('\n')
    base = os.path.splitext(os.path.basename(rel))[0]
    start = parse_start(meta.get('start')) or parse_start(base)
    title = meta.get('title') or re.sub(r'[_-]+', ' ', re.sub(r'^\d{4}-\d{2}-\d{2}[T_ -]?\d{0,4}[_ -]*', '', base)).strip() or 'Meeting'
    return {'title': title, 'start': start, 'lead': meta.get('lead', ''), 'track': meta.get('track', ''),
            'recorder': meta.get('recorder', ''), 'text': body}


def words(t):
    return re.findall(r'\w+', t.lower())


def fingerprint(t):
    """sampled 3-word shingles: stable across runs, small to store, comparable between different recordings of one call"""
    w = words(t)
    out = set()
    for i in range(len(w) - 2):
        h = zlib.crc32((w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]).encode('utf-8'))
        if h % 8 == 0:
            out.add(h)
    return out


def similar(a, b):
    """overlap of the smaller fingerprint with the other (0..1)"""
    if not a or not b:
        return 0.0
    return len(a & b) / float(min(len(a), len(b)))


def same_meeting(s1, f1, s2, f2):
    sim = similar(f1, f2)
    if s1 and s2:
        gap = abs((s1 - s2).total_seconds()) / 60.0
        if gap <= 10 and sim >= 0.04:
            return True
        if gap <= 30 and sim >= 0.12:
            return True
    return sim >= 0.30


def tid(rel):
    return hashlib.sha1(rel.encode('utf-8')).hexdigest()[:10]


def prompt_for(cfg, pipeline, hint, text):
    today = datetime.date.today()
    team = ', '.join(cfg.get('team', []))
    tracks = ' | '.join(t['name'] for t in cfg.get('tracks', []))
    leads = ' | '.join(p.get('company', '') for p in pipeline if p.get('company')) or '(none)'
    when = hint['start'].strftime('%Y-%m-%d %H:%M') if hint.get('start') else ''
    L = []
    L.append('You are the meeting-capture assistant for Inflekt OS (Inflekt Growth, a 3-partner growth consultancy). Today is %s (%s).' % (today.isoformat(), today.strftime('%A')))
    L.append('Meeting: %s%s%s%s' % (hint['title'] or '(untitled)', (' on ' + when) if when else '',
                                  ('. Related lead/client: ' + hint['lead']) if hint.get('lead') else '',
                                  ('. Track: ' + hint['track']) if hint.get('track') else ''))
    L.append('Team: ' + team)
    L.append('Tracks: ' + tracks)
    L.append('Existing leads/clients: ' + leads)
    L.append('')
    L.append('The transcript is an automatic transcription. It may mix English, Hindi and Hinglish (Hindi in Roman or Devanagari script), contain recognition errors and have no speaker labels. Understand all of it, infer who said what from the names used, and write EVERYTHING in your answer in clear English (keep names, brands and numbers exact).')
    L.append('')
    L.append('Reply with ONE code block (```text ... ```) and nothing outside it. Inside, exactly these three parts in this order:')
    L.append('===META===\n{"title":"short meeting title","date":"YYYY-MM-DD","lead":"exact name from the existing leads list, or empty","track":"exact track name, or empty"}')
    L.append('===NOTE===\nA clean meeting note in markdown, max ~350 words: "## Summary" (3-5 lines), "## Key points" (bullets: facts, numbers, stakeholders, objections, what they need, commitments), "## Open questions & risks". Do not paste the transcript. Do not use triple backticks inside the note.')
    L.append('===ITEMS===\nA valid JSON array. Each item: {"type":"task|leadupdate|lead","text":"...","owner":"","due":"YYYY-MM-DD or empty","track":"","priority":"P1|P2|P3","note":"ONE short line of context from the meeting","detail":"","lead":"","status":"","waitingOn":""}')
    L.append('Everything actionable is a TASK. There are no separate events, decisions or readings: a meeting, call or deadline that must happen = a task with its date as due; an agreed decision that needs follow-through = a task; something to read = a task. Purely informational decisions go into the note, not the items.\nRules for items:\n- task: text = short imperative headline; note = one line saying why / what was said in the meeting; owner only if explicit or unambiguous (one of the team); if we are waiting on someone outside the team, put their name in waitingOn and keep owner = our team member who follows up.\n- leadupdate: news about an EXISTING lead; lead = exact name from the list; text = one-line milestone to log (what happened); status = Active, Warm, Completed or Dropped only if clearly changed, else empty; detail = next step.\n- lead: a NEW company to approach that is not in the list; text = company; detail = context.\n- Resolve relative dates against today. Never invent anything. Skip chit-chat. Be complete: every action and lead update in the transcript.')
    L.append('')
    L.append('TRANSCRIPT:\n---\n' + text)
    return '\n'.join(L)


def prepare(root, work):
    cfg = jload(os.path.join(root, 'data', 'config.json'), {})
    pipeline = jload(os.path.join(root, 'data', 'pipeline.json'), [])
    tpath, fpath = os.path.join(root, 'data', 'transcripts.json'), os.path.join(root, 'data', 'fingerprints.json')
    trs, fps = jload(tpath, []), jload(fpath, {})
    byrel = {t['path']: t for t in trs}
    os.makedirs(work, exist_ok=True)
    for f in os.listdir(work):
        os.remove(os.path.join(work, f))

    idir = os.path.join(root, 'intake')
    found = []
    if os.path.isdir(idir):
        for dp, _, fs in os.walk(idir):
            for f in sorted(fs):
                if f.lower().endswith(EXT):
                    found.append(os.path.relpath(os.path.join(dp, f), root).replace('\\', '/'))
    new = []
    for rel in sorted(found):
        t = byrel.get(rel)
        if t and t['status'] in ('processed', 'duplicate'):
            continue                         # already handled (file just not cleaned up yet)
        if t and t['status'] in ('queued', 'failed') and t.get('attempts', 0) < 3:
            new.append((rel, t)); continue   # retry
        if t:
            continue                         # failed 3 times: leave for a human
        new.append((rel, None))

    items = []
    for rel, t in new:
        h = read_transcript(os.path.join(root, rel), rel)
        if len(words(h['text'])) < 40:
            trs = [x for x in trs if x['path'] != rel]
            trs.append({'id': tid(rel), 'path': rel, 'title': h['title'], 'status': 'failed', 'error': 'transcript too short', 'attempts': 3, 'seen': now_iso()})
            continue
        h['rel'], h['id'], h['fp'] = rel, tid(rel), fingerprint(h['text'])
        h['words'] = len(words(h['text']))
        h['tentry'] = t
        items.append(h)

    # 1) against meetings we already have  2) among the new ones
    done_meetings = [t for t in trs if t['status'] in ('processed', 'queued') and t['id'] in fps]
    keep = []
    for h in sorted(items, key=lambda x: -x['words']):      # longest transcript wins
        dup_of = None
        for t in done_meetings:
            if t['id'] == h['id']:
                continue
            ts = parse_start(t.get('start'))
            if same_meeting(h['start'], h['fp'], ts, set(fps[t['id']])):
                dup_of = t['id']; break
        if not dup_of:
            for k in keep:
                if same_meeting(h['start'], h['fp'], k['start'], k['fp']):
                    dup_of = k['id']; break
        if dup_of:
            trs = [x for x in trs if x['path'] != h['rel']]
            trs.append({'id': h['id'], 'path': h['rel'], 'title': h['title'], 'status': 'duplicate', 'dupOf': dup_of,
                        'recorder': h['recorder'], 'seen': now_iso()})
            print('duplicate:', h['rel'], '->', dup_of)
        else:
            keep.append(h)

    queued = 0
    for h in keep:
        prev = h['tentry'] or {}
        trs = [x for x in trs if x['path'] != h['rel']]
        trs.append({'id': h['id'], 'path': h['rel'], 'title': h['title'], 'status': 'queued', 'attempts': prev.get('attempts', 0) + 1,
                    'start': h['start'].strftime('%Y-%m-%dT%H:%M') if h['start'] else '', 'recorder': h['recorder'],
                    'lead': h['lead'], 'track': h['track'], 'words': h['words'], 'seen': prev.get('seen') or now_iso()})
        fps[h['id']] = sorted(h['fp'])
        with open(os.path.join(work, h['id'] + '.prompt'), 'w', encoding='utf-8') as f:
            f.write(prompt_for(cfg, pipeline, h, h['text']))
        queued += 1
        print('queued:', h['rel'], '(%d words)' % h['words'])
    jsave(tpath, trs)
    jsave(fpath, fps)
    out = os.environ.get('GITHUB_OUTPUT')
    line = 'queued=%d\n' % queued
    if out:
        open(out, 'a').write(line)
    print(line.strip())


def finish(root, work):
    tpath, ipath = os.path.join(root, 'data', 'transcripts.json'), os.path.join(root, 'data', 'inbox.json')
    trs, inbox = jload(tpath, []), jload(ipath, [])
    have = {e['id'] for e in inbox}
    for t in trs:
        if t['status'] == 'queued':
            outp = os.path.join(work, t['id'] + '.out')
            raw = open(outp, encoding='utf-8', errors='replace').read() if os.path.exists(outp) else ''
            if '===ITEMS===' in raw and '[' in raw:
                if t['id'] not in have:
                    inbox.append({'id': t['id'], 'title': t.get('title', ''), 'start': t.get('start', ''), 'recorder': t.get('recorder', ''),
                                  'lead': t.get('lead', ''), 'track': t.get('track', ''), 'raw': raw.strip(), 'status': 'pending', 'created': now_iso()})
                t['status'] = 'processed'; t.pop('error', None)
                print('processed:', t['path'])
            else:
                errp = os.path.join(work, t['id'] + '.err')
                err = (open(errp, encoding='utf-8', errors='replace').read().strip()[-300:] if os.path.exists(errp) else '') or 'Claude returned no usable reply'
                t['status'] = 'failed'; t['error'] = err
                print('FAILED:', t['path'], err)
    for t in trs:        # raw transcripts are not kept once handled
        if t['status'] in ('processed', 'duplicate'):
            p = os.path.join(root, t['path'])
            if os.path.exists(p):
                os.remove(p)
    jsave(tpath, trs)
    jsave(ipath, inbox)


if __name__ == '__main__':
    cmd, root, work = sys.argv[1], sys.argv[2], sys.argv[3]
    {'prepare': prepare, 'finish': finish}[cmd](root, work)
