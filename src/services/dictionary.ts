import { WordDefinition } from '../types/word';

export async function searchWord(word: string): Promise<WordDefinition> {
  try {
    const hasChinese = /[\u4e00-\u9fa5]/.test(word);
    const from = hasChinese ? 'zh-CHS' : 'en';
    const to = hasChinese ? 'en' : 'zh-CHS';
    const res = await fetch('/api/youdao/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: word, from, to }),
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const zh = typeof data?.translation === 'string' && data.translation ? data.translation : '';
    
    // Parse Youdao raw data for detailed info
    const raw = data.raw;
    console.log('Youdao raw response:', raw);
    
    let phonetic = undefined;
    let audio: { us?: string; uk?: string } | undefined = undefined;
    let examples: { sentence: string; translation: string }[] = [];
    let meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[] = [];
    let wfs: string[] | undefined = undefined;

    // 1. Try to parse from Web API structure (dict.youdao.com/jsonapi)
    const simple = raw?.simple?.word?.[0];
    const ec = raw?.ec?.word?.[0];

    if (simple) {
        phonetic = simple['usphone'] || simple['ukphone'] || simple['phone'];
        if (phonetic) phonetic = `/${phonetic}/`;
        
        // Audio
        if (simple['usspeech']) {
            if (!audio) audio = {};
            audio.us = `http://dict.youdao.com/dictvoice?audio=${simple['usspeech']}`;
        }
        if (simple['ukspeech']) {
            if (!audio) audio = {};
            audio.uk = `http://dict.youdao.com/dictvoice?audio=${simple['ukspeech']}`;
        }
    }

    // Examples from blng_sents_part
    if (raw?.blng_sents_part?.['sentence-pair']) {
        const sents = raw.blng_sents_part['sentence-pair'];
        if (Array.isArray(sents)) {
            examples = sents.map((s: any) => ({
                sentence: s.sentence || '',
                translation: s['sentence-translation'] || ''
            })).filter(s => s.sentence);
        }
    }

    if (ec) {
        // Parse meanings from EC
        if (Array.isArray(ec.trs)) {
            ec.trs.forEach((trItem: any) => {
                const trContent = trItem.tr?.[0]?.l?.i?.[0];
                if (typeof trContent === 'string') {
                    const match = trContent.match(/^([a-z]+\.)\s*(.+)/i);
                    if (match) {
                        meanings.push({
                            partOfSpeech: match[1],
                            definitions: [{ definition: match[2] }]
                        });
                    } else {
                        meanings.push({
                            partOfSpeech: '基本释义',
                            definitions: [{ definition: trContent }]
                        });
                    }
                }
            });
        }
        // Parse WFS from EC (if available)
        if (ec.wfs && Array.isArray(ec.wfs)) {
             wfs = ec.wfs.map((item: any) => {
                 if (item.wf) {
                     return `${item.wf.name}: ${item.wf.value}`;
                 }
                 return '';
             }).filter((s: string) => s);
        }
    }

    // 2. Fallback to old OpenAPI structure (if Web API didn't return useful info)
    const basic = raw?.basic;
    if (meanings.length === 0 && basic) {
      if (!phonetic) {
          phonetic = basic['us-phonetic'] || basic['uk-phonetic'] || basic['phonetic'];
          if (phonetic) phonetic = `/${phonetic}/`;
      }

      if (!wfs && basic.wfs && Array.isArray(basic.wfs)) {
         wfs = basic.wfs.map((item: any) => {
             if (item.wf) {
                 return `${item.wf.name}: ${item.wf.value}`;
             }
             return '';
         }).filter((s: string) => s);
      }

      if (Array.isArray(basic.explains)) {
        // Group definitions by part of speech
        const grouped: Record<string, string[]> = {};
        
        basic.explains.forEach((exp: string) => {
          const match = exp.match(/^([a-z]+\.)\s*(.+)/i);
          if (match) {
            const pos = match[1];
            const def = match[2];
            if (!grouped[pos]) grouped[pos] = [];
            grouped[pos].push(def);
          } else {
            if (!grouped['other']) grouped['other'] = [];
            grouped['other'].push(exp);
          }
        });

        Object.entries(grouped).forEach(([pos, defs]) => {
            meanings.push({
                partOfSpeech: pos === 'other' ? '基本释义' : pos,
                definitions: defs.map(d => ({ definition: d }))
            });
        });
      }
    }

    // 3. Web definitions (common for both)
    // Web API structure: raw.web_trans['web-translation']
    if (raw?.web_trans?.['web-translation']) {
        const webTrans = raw.web_trans['web-translation'];
        if (Array.isArray(webTrans)) {
             const webDefs = webTrans.map((item: any) => {
                 const key = item['key-speech'] || item.key;
                 const trans = item.trans?.map((t: any) => t.value).join('；');
                 return { definition: `${key}: ${trans}` };
             });
             if (webDefs.length > 0) {
                 meanings.push({
                     partOfSpeech: '网络释义',
                     definitions: webDefs
                 });
             }
        }
    }
    // OpenAPI structure: raw.web
    else if (raw?.web && Array.isArray(raw.web)) {
        const webDefs = raw.web.map((item: any) => {
            const key = item.key;
            const values = Array.isArray(item.value) ? item.value.join('；') : item.value;
            return { definition: `${key}: ${values}` };
        });
        if (webDefs.length > 0) {
            meanings.push({
                partOfSpeech: '网络释义',
                definitions: webDefs
            });
        }
    }

    // Fallback if no basic info found or meanings is empty
    if (meanings.length === 0) {
       if (!zh) throw new Error('Translation not found');
       meanings.push({
          partOfSpeech: hasChinese ? 'zh→en' : 'en→zh',
          definitions: [{ definition: zh }]
       });
    }

    const def: WordDefinition = {
      word: raw?.query || (hasChinese ? zh : word),
      phonetic,
      audio,
      meanings,
      wfs,
      examples,
    };
    return def;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to search word');
  }
}