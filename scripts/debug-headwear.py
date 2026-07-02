import urllib.request, re
html = urllib.request.urlopen(urllib.request.Request(
    'https://qld.headwear.com.au/headwear-styles/',
    headers={'User-Agent': 'Mozilla/5.0'}
)).read().decode()

# Find card-title links
titles = re.findall(
    r'class="card-title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>\s*([^<]+?)\s*</a>',
    html
)
print('titles', len(titles))
for t in titles[:8]:
    print(t)

# product id near title
for href, name in titles[:3]:
    idx = html.find(name)
    chunk = html[max(0,idx-500):idx+500]
    pid = re.search(r'data-product-id="(\d+)"', chunk)
    img = re.search(r'src="(https://cdn11[^"]+)"', chunk)
    print('chunk pid', pid.group(1) if pid else None, 'img', bool(img))