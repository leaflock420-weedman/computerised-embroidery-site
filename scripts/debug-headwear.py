import urllib.request, re
url = 'https://qld.headwear.com.au/terry-towelling-bucket-hat/'
html = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})).read().decode()
# listing page chunk
list_html = urllib.request.urlopen(urllib.request.Request('https://qld.headwear.com.au/headwear-styles/', headers={'User-Agent':'Mozilla/5.0'})).read().decode()
name = 'Terry Towelling Bucket Hat'
idx = list_html.find(name)
chunk = list_html[max(0,idx-1500):idx+800]
print('--- listing chunk imgs ---')
for m in re.findall(r'(?:data-src|src|data-lazy)=["\']([^"\']+)["\']', chunk):
    if 'bigcommerce' in m or 'loading' in m:
        print(m[:120])
print('--- product page ---')
for m in re.findall(r'(?:data-src|src)=["\'](https://cdn11[^"\']+)["\']', html):
    if 'loading' not in m and 'products/' in m:
        print(m[:120])