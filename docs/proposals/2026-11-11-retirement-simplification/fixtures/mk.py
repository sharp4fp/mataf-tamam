# Synthetic Mimshak 009 file - no real client data.
def track(name, code, amt):
    return f"<PerutMasluleiHashkaa><SHEM-MASLUL-HASHKAA>{name}</SHEM-MASLUL-HASHKAA><KOD-MASLUL-HASHKAA>{code}</KOD-MASLUL-HASHKAA><SCHUM-TZVIRA-BAMASLUL>{amt}</SCHUM-TZVIRA-BAMASLUL></PerutMasluleiHashkaa>"
def acc(no, plan, tracks, fd, fa, sev=None, employer='חברה סינתטית בע"מ', forecast=None):
    s = f"<HeshbonOPolisa><MISPAR-POLISA-O-HESHBON>{no}</MISPAR-POLISA-O-HESHBON><SHEM-TOCHNIT>{plan}</SHEM-TOCHNIT><STATUS-POLISA-O-CHESHBON>1</STATUS-POLISA-O-CHESHBON><TAARICH-ERECH-TZVIROT>20260930</TAARICH-ERECH-TZVIROT>"
    s += "".join(track(*t) for t in tracks)
    s += f"<HotzaotBafoalLehodeshDivoach><SHEUR-DMEI-NIHUL-HAFKADA>{fd}</SHEUR-DMEI-NIHUL-HAFKADA><SHEUR-DMEI-NIHUL-TZVIRA>{fa}</SHEUR-DMEI-NIHUL-TZVIRA></HotzaotBafoalLehodeshDivoach>"
    s += "<PerutPirteiHafkadaAchrona><SUG-HAFKADA>1</SUG-HAFKADA><TAARICH-HAFKADA-ACHARON>202609</TAARICH-HAFKADA-ACHARON><TOTAL-HAFKADA>3500</TOTAL-HAFKADA></PerutPirteiHafkadaAchrona>"
    s += "<CHODESH-SACHAR>202609</CHODESH-SACHAR><SACHAR-BERAMAT-HAFKADA>18500</SACHAR-BERAMAT-HAFKADA>"
    if sev: s += f"<YITRAT-PITZUIM-LELO-HITCHASHBENOT>{sev}</YITRAT-PITZUIM-LELO-HITCHASHBENOT>"
    if forecast: s += f"<YitraLefiGilPrisha><GIL-PRISHA>67</GIL-PRISHA><TOTAL-CHISACHON-MITZTABER-TZAFUY>{forecast[0]}</TOTAL-CHISACHON-MITZTABER-TZAFUY><SCHUM-KITZVAT-ZIKNA>{forecast[1]}</SCHUM-KITZVAT-ZIKNA></YitraLefiGilPrisha>"
    return s + "</HeshbonOPolisa>"
def yz(name, sug, accs):
    return f"<YeshutYatzran><SHEM-YATZRAN>{name}</SHEM-YATZRAN><Mutzar><SUG-MUTZAR>{sug}</SUG-MUTZAR><NetuneiMutzar><YeshutMaasik><SHEM-MAASIK>חברה סינתטית בע\"מ</SHEM-MAASIK><STATUS-MAASIK>1</STATUS-MAASIK></YeshutMaasik></NetuneiMutzar>{''.join(accs)}</Mutzar></YeshutYatzran>"
xml = '<?xml version="1.0" encoding="UTF-8"?><Mimshak><KoteretKovetz><SUG-MIMSHAK>009</SUG-MIMSHAK></KoteretKovetz>'
xml += "<YeshutLakoach><SHEM-PRATI>ישראל</SHEM-PRATI><SHEM-MISHPACHA>בדיקה</SHEM-MISHPACHA><MISPAR-ZIHUY-LAKOACH>123456782</MISPAR-ZIHUY-LAKOACH><TAARICH-LEIDA>19601115</TAARICH-LEIDA><MIN>1</MIN><SHEM-YISHUV>עיר לדוגמה</SHEM-YISHUV></YeshutLakoach>"
xml += yz('מנורה מבטחים פנסיה וגמל בע"מ', '2', [acc('900001', 'מנורה מבטחים פנסיה - קרן פנסיה מקיפה', [('מסלול לבני 60 ומעלה', '15000003', '1450000')], 1.0, 0.12, '450000', forecast=('1520000','7900'))])
xml += yz('הראל חברה לביטוח בע"מ', '1', [acc('900002', 'הראל ביטוח מנהלים', [('הראל מסלול כללי', '', '380000')], 0, 0.9, '200000')])
xml += yz('מגדל מקפת קרנות פנסיה וקופות גמל בע"מ', '4', [acc('900003', 'מגדל קרן השתלמות', [('מגדל השתלמות כללי', '', '240000')], 0, 0.55)])
xml += yz('מנורה מבטחים פנסיה וגמל בע"מ', '3', [acc('900004', 'מנורה מבטחים קופת גמל תגמולים', [('מנורה גמל כללי', '', '120000')], 0, 0.5)])
xml += '</Mimshak>'
open('synthetic-009.xml','w',encoding='utf-8').write(xml)
