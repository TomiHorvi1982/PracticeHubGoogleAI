export interface SongSection {
  id: string;
  title: string;
  type: 'chorus' | 'verse' | 'bridge' | 'intro' | 'outro' | 'solo' | 'section';
  startLine: number;
  endLine: number;
  lines: string[];
  content: string;
}

export function parseSongSections(content: string): SongSection[] {
  if (!content) return [];
  const rawLines = content.split('\n');
  const sections: SongSection[] = [];

  // Regex to match section headers like [Chorus], [Refren], [Refrén], Verse 1:, Sloka 2:, [Bridge], etc.
  const sectionHeaderRegex = /^\s*\[?\s*(Chorus|Refrén|Refren|Verse|Sloka|Bridge|Intro|Outro|Solo|Pre-Chorus|Mezihra|C-part|A-part|B-part)(\s*[\d\w]*)\]?\s*:?\s*$/i;

  let currentTitle = '';
  let currentStart = 0;
  let currentLines: string[] = [];

  const determineType = (title: string): SongSection['type'] => {
    const t = title.toLowerCase();
    if (t.includes('chorus') || t.includes('refren') || t.includes('refrén')) return 'chorus';
    if (t.includes('verse') || t.includes('sloka')) return 'verse';
    if (t.includes('bridge')) return 'bridge';
    if (t.includes('intro')) return 'intro';
    if (t.includes('outro')) return 'outro';
    if (t.includes('solo')) return 'solo';
    return 'section';
  };

  rawLines.forEach((line, idx) => {
    const trimmed = line.trim();
    // Check if line looks like a section header
    const match = trimmed.match(sectionHeaderRegex);

    if (match) {
      if (currentLines.length > 0) {
        const title = currentTitle || `Sekce ${sections.length + 1}`;
        sections.push({
          id: `sec-${sections.length}`,
          title,
          type: determineType(title),
          startLine: currentStart,
          endLine: idx - 1,
          lines: currentLines,
          content: currentLines.join('\n'),
        });
      }
      currentTitle = trimmed.replace(/^\[|\]$:?/g, '').trim();
      // Capitalize nicely if needed
      if (currentTitle.length > 0) {
        currentTitle = currentTitle.charAt(0).toUpperCase() + currentTitle.slice(1);
      }
      currentStart = idx;
      currentLines = [line];
    } else {
      if (currentLines.length === 0 && trimmed !== '') {
        currentStart = idx;
      }
      currentLines.push(line);
    }
  });

  if (currentLines.length > 0) {
    const title = currentTitle || (sections.length === 0 ? 'Celá skladba' : `Sekce ${sections.length + 1}`);
    sections.push({
      id: `sec-${sections.length}`,
      title,
      type: determineType(title),
      startLine: currentStart,
      endLine: rawLines.length - 1,
      lines: currentLines,
      content: currentLines.join('\n'),
    });
  }

  // Fallback: If no explicit headers were detected and content is divided by blank lines (paragraphs)
  if (sections.length <= 1 && rawLines.length > 6) {
    const paragraphSections: SongSection[] = [];
    let pStart = 0;
    let pLines: string[] = [];
    let pCount = 1;

    rawLines.forEach((line, idx) => {
      if (line.trim() === '') {
        if (pLines.length > 0) {
          const firstLine = pLines[0].trim();
          let pTitle = `Sekce ${pCount}`;
          if (firstLine.length < 30 && (firstLine.endsWith(':') || firstLine.startsWith('['))) {
            pTitle = firstLine.replace(/^\[|\]$:?/g, '').trim();
          }

          paragraphSections.push({
            id: `psec-${pCount}`,
            title: pTitle,
            type: determineType(pTitle),
            startLine: pStart,
            endLine: idx - 1,
            lines: pLines,
            content: pLines.join('\n'),
          });
          pCount++;
          pLines = [];
        }
      } else {
        if (pLines.length === 0) pStart = idx;
        pLines.push(line);
      }
    });

    if (pLines.length > 0) {
      const firstLine = pLines[0].trim();
      let pTitle = `Sekce ${pCount}`;
      if (firstLine.length < 30 && (firstLine.endsWith(':') || firstLine.startsWith('['))) {
        pTitle = firstLine.replace(/^\[|\]$:?/g, '').trim();
      }

      paragraphSections.push({
        id: `psec-${pCount}`,
        title: pTitle,
        type: determineType(pTitle),
        startLine: pStart,
        endLine: rawLines.length - 1,
        lines: pLines,
        content: pLines.join('\n'),
      });
    }

    if (paragraphSections.length > 1) {
      return paragraphSections;
    }
  }

  return sections;
}
