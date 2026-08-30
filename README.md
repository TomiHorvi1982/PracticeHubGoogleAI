
## Místní přepis textů

Sekce **Texty** přepisuje zpěv z nahrávky na tomhle stroji — ven neodchází
nic. Potřebuje dvě věci, které nejsou v repozitáři, protože jsou to
stovky megabajtů:

```bash
brew install whisper-cpp
uv tool install demucs --with numpy
```

a modely do `modely/` (složka je v `.gitignore`):

```bash
curl -L -o modely/ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
curl -L -o modely/ggml-silero-v5.1.2.bin https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin
```

Demucs si model stáhne sám při prvním spuštění (jednorázově pár minut).
Bez druhého modelu přepis funguje taky, jen si v instrumentálních
pasážích domýšlí věty, které nikdo nezpíval.

Naměřeno na M1 Pro: oddělení zpěvu běží zhruba třikrát rychleji než
přehrávání (čtyřminutová píseň kolem 80 s), samotný přepis kolem 20 s.
