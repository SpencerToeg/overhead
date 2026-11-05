# Minimal static file server for previewing app/index.html in a browser (no Node/Python needed)
$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'app'
$port = if ($env:PORT) { $env:PORT } else { '5173' }
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($path -eq '') { $path = 'index.html' }
  $file = Join-Path $root $path
  if (Test-Path $file -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ctx.Response.ContentType = if ($file -like '*.html') { 'text/html; charset=utf-8' } elseif ($file -like '*.js') { 'text/javascript' } else { 'application/octet-stream' }
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
