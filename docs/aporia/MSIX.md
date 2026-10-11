# Aporia MSIX (sideload)

Build (Windows): `OPENCODE_CHANNEL=prod OPENCODE_CLI_DIST=<cli dir> bun run prebuild && bun run build && bun run package:win`
produces `dist/*.appx` (MSIX) and the NSIS exe.

## Dev certificate (one time)
```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Aporia Nous" -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(3)
Export-Certificate -Cert $cert -FilePath "$env:USERPROFILE\Aporia\aporia-dev.cer"
# Trust it for sideloading (admin PowerShell, once):
Import-Certificate -FilePath "$env:USERPROFILE\Aporia\aporia-dev.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPeople
```
Sign: `signtool sign /fd SHA256 /sha1 <thumbprint> /s My dist\Aporia*.appx`
Install: `Add-AppxPackage dist\Aporia*.appx` (Settings > System > For developers > developer mode not required once the cert is trusted).

## Store later
Reserve the name in Partner Center, set `identityName`/`publisher` to the values it gives you, build unsigned, and upload; the Store signs it.
