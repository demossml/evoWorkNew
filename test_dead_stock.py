#!/usr/bin/env python3
import subprocess, json, sys
from datetime import datetime

P=F=0

def ok(n):
    global P;P+=1;print('  PASS:',n)

def bug(n,e,a):
    global F;F+=1;print('  FAIL:',n);print('    Expected:',e);print('    Actual:  ',a)

def curl(url,method='GET',body=None):
    cmd=['curl','-s','-H','initData: guest','-H','telegram-id: 5700958253']
    if method=='POST':
        cmd+=['-X','POST','-H','Content-Type: application/json','-d',json.dumps(body)]
    cmd.append(url)
    r=subprocess.run(cmd,capture_output=True,text=True)
    if r.returncode!=0:raise Exception(f'curl failed: {r.stderr}')
    return json.loads(r.stdout)

B='http://localhost:3000'

# TEST 1
print('='*60)
print('TEST 1: GET cache')
print('='*60)
d=curl(B+'/api/analytics/dead-stock?daysWithoutSales=14')
it=d.get('items',[]);tt=d.get('total',0);tf=d.get('totalFrozenCost',0);ca=d.get('categories',[])
print('Total:',tt,'totalFrozenCost:',tf)
if tf>0:ok('totalFrozenCost > 0')
else:bug('totalFrozenCost > 0','> 0','%s (zero)'%tf)
wu=sum(1 for i in it if i.get('unitCost') is not None)
if wu>0:ok('unitCost non-null: %s/%s'%(wu,tt))
else:bug('unitCost non-null: %s/%s'%(wu,tt),'> 0','0/%s - ALL null'%tt)
if 'totalFrozenCost' in d:ok('totalFrozenCost field')
else:bug('totalFrozenCost field','present','missing')
ne=[c for c in ca if c.get('totalFrozenCost',0)>0]
if ne:ok('cats sum>0: %s'%len(ne))
else:bug('cats sum>0','> 0','all %s cats = 0'%len(ca))
ws=sum(1 for i in it if (i.get('currentStock') or 0)>0)
if ws>0:ok('stock>0: %s/%s'%(ws,tt))
else:bug('stock>0: %s/%s'%(ws,tt),'> 0','0')
ci=[i for i in it if i.get('unitCost') and i.get('totalFrozenCost') and i.get('currentStock')]
b4=0
for i in ci:
    q=i.get('currentStock') or 0
    if q>0 and abs(i['totalFrozenCost']-i['unitCost'])<0.01:b4+=1
if b4>0:bug('tfc = qty * uc','qty * uc','==uc for %s items (qty=1?)'%b4)
elif ci:ok('tfc = qty * uc')
else:print('  SKIP: no costs with stock')

# TEST 2
print()
print('='*60)
print('TEST 2: POST 30-day')
print('='*60)
d2=curl(B+'/api/dead-stocks/data','POST',{'startDate':'2026-06-27','endDate':'2026-07-27','shopIds':None,'groups':[]})
i2=d2.get('salesData',[])
n9=sum(1 for i in i2 if i.get('daysWithoutSales')==999)
wd=sum(1 for i in i2 if i.get('lastSaleDate'))
print('Total:',len(i2),'keys:',list(d2.keys()))
print('days=999:',n9,'/',len(i2),'&lastSale:',wd,'/',len(i2))
if n9<len(i2):ok('days=999: %s/%s'%(n9,len(i2)))
else:bug('days=999: %s/%s'%(n9,len(i2)),'some < 999','ALL =999')
if wd>0:ok('lastSale: %s/%s'%(wd,len(i2)))
else:bug('lastSale: %s/%s'%(wd,len(i2)),'> 0','0')
if 'totalFrozenCost' in d2:ok('tfc in POST')
else:bug('tfc in POST','present','keys: %s'%list(d2.keys()))
if 'categories' in d2:ok('cats in POST')
else:bug('cats in POST','present','keys: %s'%list(d2.keys()))

# TEST 3
print()
print('='*60)
print('TEST 3: POST All time')
print('='*60)
d3=curl(B+'/api/dead-stocks/data','POST',{'startDate':'2020-01-01','endDate':'2026-07-27','shopIds':None,'groups':[]})
i3=d3.get('salesData',[])
n93=sum(1 for i in i3 if i.get('daysWithoutSales')==999)
wd3=sum(1 for i in i3 if i.get('lastSaleDate'))
print('Total:',len(i3),'days=999:',n93,'/',len(i3),'lastSale:',wd3,'/',len(i3))
if wd3>0:ok('All time lastSale: %s/%s'%(wd3,len(i3)))
else:bug('All time lastSale: %s/%s'%(wd3,len(i3)),'> 0','0')
if n93<n9:ok('Wider reduced 999: %s->%s'%(n9,n93))
else:bug('Wider 999: %s->%s'%(n9,n93),'decrease','no change')

# TEST 4
print()
print('='*60)
print('TEST 4: Cache vs POST')
print('='*60)
cws=[i for i in it if i.get('lastSaleDate')]
print('Cache with lastSale:',len(cws),'/',tt)
if cws:
    s=cws[0]
    print('Sample:',s['name'][:60])
    print('  Cache: days=%s, last=%s'%(s['daysWithoutSales'],s['lastSaleDate']))
    m=[i for i in i2 if i['itemId']==s['itemId'] and i['shopId']==s['shopId']]
    if m:
        mm=m[0]
        print('  POST:  days=%s, last=%s'%(mm['daysWithoutSales'],mm.get('lastSaleDate')))
        if mm['daysWithoutSales']==s['daysWithoutSales']:ok('days match')
        else:bug('days match','c=%s, p=%s'%(s['daysWithoutSales'],mm['daysWithoutSales']),'mismatch')
    else:
        print('  POST: NOT FOUND')
        bug('Cache item in POST','present','NOT FOUND')
else:print('  SKIP: no lastSale')

# TEST 5
print()
print('='*60)
print('TEST 5: Cache freshness')
print('='*60)
if it:
    ds=sorted(set(i.get('updatedAt') for i in it if i.get('updatedAt')))
    print('Dates:',ds)
    nw=datetime.now()
    for d in ds:
        da=(nw-datetime.strptime(d,'%Y-%m-%d')).days
        if da<=1:ok('Fresh: %s (%dd)'%(d,da))
        else:bug('Fresh (%s)'%d,'today/yesterday','%dd ago'%da)
else:print('  SKIP: empty')

print()
print('='*60)
print('TOTAL: %s passed, %s failed'%(P,F))
print('='*60)
if F:
    print()
    print('BUGS:')
    print('  1. No cost prices - ALL unitCost=null')
    print('  2. POST days=999 for ALL')
    print('  3. POST no totalFrozenCost')
    print('  4. Cache tfc=unitCost not qty*uc')
    print('  5. Cache stale (cron)')
sys.exit(0 if F==0 else 1)
