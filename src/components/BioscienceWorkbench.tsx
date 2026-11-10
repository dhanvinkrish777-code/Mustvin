import React, { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import SmilesDrawer from 'smiles-drawer';
import {
  Atom,
  BookOpen,
  Dna,
  ExternalLink,
  FlaskConical,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  SunMoon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface BioscienceWorkbenchProps {
  onStatusUpdate?: (msg: string) => void;
  onExplainInChat?: (queryText: string) => void;
}

type ScienceDomainTab = 'proteins' | 'chemistry' | 'genomics' | 'literature';
type ViewerRenderStyle = 'cartoon' | 'stick' | 'sphere' | 'line';

interface QuickExampleItem {
  label: string;
  domain: ScienceDomainTab;
  proteinId?: string;
  geneSymbol?: string;
  compoundName?: string;
  rsid?: string;
  sourceMode?: 'alphafold' | 'pdb';
}

const QUICK_TRY_EXAMPLES: QuickExampleItem[] = [
  {
    label: 'TP53 · P04637 (AlphaFold)',
    domain: 'proteins',
    proteinId: 'P04637',
    geneSymbol: 'TP53',
    sourceMode: 'alphafold',
  },
  {
    label: 'BRCA1 · P38398 (AlphaFold)',
    domain: 'proteins',
    proteinId: 'P38398',
    geneSymbol: 'BRCA1',
    sourceMode: 'alphafold',
  },
  {
    label: 'EGFR · P00533 (AlphaFold)',
    domain: 'proteins',
    proteinId: 'P00533',
    geneSymbol: 'EGFR',
    sourceMode: 'alphafold',
  },
  {
    label: 'Hemoglobin · 4HHB (PDB)',
    domain: 'proteins',
    proteinId: '4HHB',
    geneSymbol: 'HBB',
    sourceMode: 'pdb',
  },
  {
    label: 'Imatinib (Drug)',
    domain: 'chemistry',
    compoundName: 'imatinib',
    proteinId: 'P00519',
  },
  {
    label: 'Aspirin (Compound)',
    domain: 'chemistry',
    compoundName: 'aspirin',
  },
  {
    label: 'AGT · rs699 (Genomics)',
    domain: 'genomics',
    geneSymbol: 'AGT',
    rsid: 'rs699',
  },
];

interface UniProtFeatureItem {
  type: string;
  description: string;
  start: number;
  end: number;
}

interface ProteinSummaryState {
  accession: string;
  proteinName: string;
  geneSymbol: string;
  organism: string;
  sequenceLength: number;
  sequence: string;
  functionText: string;
  provenance: 'Predicted by model' | 'Experimentally determined';
  resolution?: string;
  experimentalMethod?: string;
  sourceUrl: string;
  paeImageUrl?: string;
  features: UniProtFeatureItem[];
  interproDomains: Array<{ accession: string; name: string; sourceDb: string }>;
  gtexTopTissues: Array<{ tissue: string; medianTpm: number }>;
}

interface CompoundSummaryState {
  name: string;
  cid: number;
  formula: string;
  molecularWeight: number;
  smiles: string;
  inchiKey: string;
  xlogp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatableBonds: number;
  lipinskiPass: boolean;
  lipinskiViolations: number;
  veberPass: boolean;
  pubchem2dUrl: string;
  chemblActivities: Array<{
    moleculeId: string;
    assayType: string;
    value: string;
    units: string;
    pchembl: string;
  }>;
  fdaTopReactions: Array<{ term: string; count: number }>;
}

interface GenomicsSummaryState {
  geneSymbol: string;
  ensemblId: string;
  biotype: string;
  chrom: string;
  start: number;
  end: number;
  canonicalTranscript: string;
  alphaGenomeLocusUrl: string;
  gnomadConstraint?: {
    pli: number | null;
    oeLof: number | null;
    loeuf: number | null;
    misZ: number | null;
  };
  vepVariant?: {
    id: string;
    alleleString: string;
    mostSevereConsequence: string;
    chrom: string;
    pos: number;
    alphaGenomeVariantUrl: string;
  };
  clinvarItems: Array<{
    uid: string;
    title: string;
    significance: string;
    reviewStatus: string;
    stars: number;
    condition: string;
  }>;
}

interface LiteratureSummaryState {
  query: string;
  europePmcPapers: Array<{
    id: string;
    title: string;
    authors: string;
    journal: string;
    pubYear: string;
    citedByCount: number;
    isOpenAccess: boolean;
    url: string;
  }>;
  arxivPreprints: Array<{
    id: string;
    title: string;
    summary: string;
    published: string;
  }>;
  clinicalTrials: Array<{
    nctId: string;
    title: string;
    status: string;
    phases: string;
    interventions: string;
  }>;
}

function buildAlphaGenomeAtlasUrl(params: {
  mode: 'locus' | 'variant';
  chrom: string;
  start?: number;
  end?: number;
  pos?: number;
  ref?: string;
  alt?: string;
}): string {
  const cleanChrom = params.chrom.replace(/^chr/i, '');
  const searchParams = new URLSearchParams();
  if (params.mode === 'variant' && params.pos && params.ref && params.alt) {
    searchParams.set('q', `chr${cleanChrom}:${params.pos}:${params.ref}>${params.alt}`);
    searchParams.set('m', 'variant');
  } else {
    const s = params.start || 7668402;
    const e = params.end || 7687550;
    searchParams.set('q', `chr${cleanChrom}:${s}-${e}`);
    searchParams.set('m', 'locus');
  }
  searchParams.set('lItems', 'avi,section:RNA_SEQ,section:DNASE,section:CHIP_TF');
  return `https://deepmind.google.com/science/alphagenome/atlas?${searchParams.toString()}`;
}

function computeReviewStars(statusText: string): number {
  const s = (statusText || '').toLowerCase();
  if (s.includes('practice guideline')) return 4;
  if (s.includes('expert panel')) return 3;
  if (s.includes('multiple submitters') && s.includes('no conflicts')) return 2;
  if (s.includes('criteria provided')) return 1;
  return 0;
}

export const BioscienceWorkbench: React.FC<BioscienceWorkbenchProps> = ({
  onStatusUpdate,
  onExplainInChat,
}) => {
  const [domainTab, setDomainTab] = useState<ScienceDomainTab>('proteins');

  // Search Inputs
  const [proteinQuery, setProteinQuery] = useState<string>('P04637');
  const [proteinSourceMode, setProteinSourceMode] = useState<'alphafold' | 'pdb'>('alphafold');
  const [compoundQuery, setCompoundQuery] = useState<string>('imatinib');
  const [geneQuery, setGeneQuery] = useState<string>('TP53');
  const [variantQuery, setVariantQuery] = useState<string>('rs699');
  const [literatureQuery, setLiteratureQuery] = useState<string>('TP53 AlphaFold');

  // 3Dmol Viewer Controls
  const [viewerStyle, setViewerStyle] = useState<ViewerRenderStyle>('cartoon');
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [darkViewport, setDarkViewport] = useState<boolean>(true);
  const [clickedAtomInfo, setClickedAtomInfo] = useState<string>('');

  // Data States
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [proteinData, setProteinData] = useState<ProteinSummaryState | null>(null);
  const [compoundData, setCompoundData] = useState<CompoundSummaryState | null>(null);
  const [genomicsData, setGenomicsData] = useState<GenomicsSummaryState | null>(null);
  const [literatureData, setLiteratureData] = useState<LiteratureSummaryState | null>(null);

  const proteinViewerContainerRef = useRef<HTMLDivElement>(null);
  const proteinViewerInstanceRef = useRef<any>(null);
  const loadedCifRef = useRef<{ cif: string; format: 'cif' | 'sdf'; isAlphaFold: boolean } | null>(
    null
  );

  const chem3dContainerRef = useRef<HTMLDivElement>(null);
  const chem3dViewerRef = useRef<any>(null);
  const smilesCanvasRef = useRef<HTMLCanvasElement>(null);

  const applyProteinViewerStyle = (
    viewer: any,
    style: ViewerRenderStyle,
    isAlphaFold: boolean
  ) => {
    if (!viewer) return;
    const plddtColorFunc = (atom: any) => {
      const b = Number(atom?.b ?? 80);
      if (b > 90) return '#0053D6';
      if (b > 70) return '#65CBF3';
      if (b > 50) return '#FFDB13';
      return '#FF7D45';
    };

    if (style === 'cartoon') {
      viewer.setStyle(
        {},
        {
          cartoon: isAlphaFold ? { colorfunc: plddtColorFunc } : { color: 'spectrum' },
        }
      );
      // Render bound ligands/cofactors as sticks when present in PDB files
      if (!isAlphaFold) {
        viewer.setStyle(
          { hetflag: true, resn: ['HOH', 'WAT'], invert: true },
          {
            stick: { radius: 0.24, colorscheme: 'Jmol' },
            sphere: { scale: 0.28, colorscheme: 'Jmol' },
          }
        );
      }
    } else if (style === 'stick') {
      viewer.setStyle({}, { stick: { radius: 0.18, colorscheme: 'Jmol' } });
    } else if (style === 'sphere') {
      viewer.setStyle({}, { sphere: { scale: 0.75, colorscheme: 'Jmol' } });
    } else {
      viewer.setStyle({}, { line: { colorscheme: 'Jmol' } });
    }
    viewer.render();
  };

  // Mount / refresh 3Dmol Protein Viewer whenever proteinData or tab changes
  useEffect(() => {
    if (domainTab !== 'proteins' || !proteinViewerContainerRef.current || !loadedCifRef.current) {
      return;
    }

    const container = proteinViewerContainerRef.current;
    container.innerHTML = '';
    const viewer = ($3Dmol as any).createViewer(container, {
      backgroundColor: darkViewport ? '#0f172a' : '#f8fafc',
    });
    proteinViewerInstanceRef.current = viewer;

    viewer.addModel(loadedCifRef.current.cif, loadedCifRef.current.format);
    applyProteinViewerStyle(viewer, viewerStyle, loadedCifRef.current.isAlphaFold);

    viewer.setClickable({}, true, (atom: any) => {
      if (!atom) return;
      const confNote = loadedCifRef.current?.isAlphaFold
        ? ` · pLDDT ${Number(atom.b || 0).toFixed(1)}`
        : '';
      setClickedAtomInfo(
        `Residue ${atom.resn} ${atom.resi} (Chain ${atom.chain || 'A'})${confNote}`
      );
      viewer.removeAllShapes();
      viewer.addSphere({
        center: { x: atom.x, y: atom.y, z: atom.z },
        radius: 1.8,
        color: '#1A73E8',
        opacity: 0.55,
      });
      viewer.render();
    });

    viewer.zoomTo();
    viewer.render();
    viewer.spin(isSpinning ? 'y' : false);
  }, [domainTab, proteinData, darkViewport]);

  // Style & Spin updates without reloading coordinates
  useEffect(() => {
    const viewer = proteinViewerInstanceRef.current;
    if (!viewer || !loadedCifRef.current) return;
    applyProteinViewerStyle(viewer, viewerStyle, loadedCifRef.current.isAlphaFold);
    viewer.spin(isSpinning ? 'y' : false);
  }, [viewerStyle, isSpinning]);

  // Draw 2D SMILES structure via SmilesDrawer whenever compoundData updates
  useEffect(() => {
    if (domainTab !== 'chemistry' || !compoundData?.smiles || !smilesCanvasRef.current) return;
    try {
      const drawer = new (SmilesDrawer as any).Drawer({
        width: 280,
        height: 240,
        bondThickness: 1.6,
        bondLength: 17,
      });
      (SmilesDrawer as any).parse(
        compoundData.smiles,
        (tree: any) => {
          drawer.draw(tree, smilesCanvasRef.current, 'light', false);
        },
        () => {}
      );
    } catch {}
  }, [domainTab, compoundData]);

  const highlightResidueSpan = (start: number, end: number, label: string) => {
    const viewer = proteinViewerInstanceRef.current;
    if (!viewer || !loadedCifRef.current) return;
    applyProteinViewerStyle(viewer, viewerStyle, loadedCifRef.current.isAlphaFold);
    const resiRange: number[] = [];
    for (let r = start; r <= Math.min(end, start + 250); r++) {
      resiRange.push(r);
    }
    viewer.addStyle({ resi: resiRange }, { stick: { radius: 0.25, color: '#0D9488' } });
    viewer.zoomTo({ resi: resiRange });
    viewer.render();
    setClickedAtomInfo(`Focused ${label} (Residues ${start}–${end})`);
  };

  // 1. Load Protein & 3D Structure (AlphaFold DB + RCSB PDB + UniProtKB + InterPro + GTEx v10)
  const loadProteinWorkbench = async (
    rawIdentifier: string,
    modeOverride?: 'alphafold' | 'pdb'
  ) => {
    const cleanInput = rawIdentifier.trim().toUpperCase();
    if (!cleanInput) return;

    setLoading(true);
    setErrorMsg('');
    setClickedAtomInfo('');

    const isPdbCode =
      modeOverride === 'pdb' || (modeOverride !== 'alphafold' && /^[1-9][A-Z0-9]{3}$/.test(cleanInput));

    try {
      if (isPdbCode) {
        onStatusUpdate?.(`Fetching experimental structure ${cleanInput} from RCSB PDB...`);
        const [metaRes, cifRes] = await Promise.all([
          fetch(`https://data.rcsb.org/rest/v1/core/entry/${cleanInput.toLowerCase()}`),
          fetch(`https://files.rcsb.org/download/${cleanInput}.cif`),
        ]);
        if (!metaRes.ok || !cifRes.ok) {
          throw new Error(`RCSB PDB entry "${cleanInput}" was not found.`);
        }
        const meta = await metaRes.json();
        const cifText = await cifRes.text();
        loadedCifRef.current = { cif: cifText, format: 'cif', isAlphaFold: false };

        const resolutionVal = meta?.rcsb_entry_info?.resolution_combined?.[0];
        const methodVal = meta?.rcsb_entry_info?.experimental_method?.[0] || 'X-RAY / CRYO-EM';

        setProteinData({
          accession: cleanInput,
          proteinName: meta?.struct?.title || `PDB Experimental Structure ${cleanInput}`,
          geneSymbol: cleanInput,
          organism: 'Experimental Macromolecular Complex',
          sequenceLength: Number(meta?.rcsb_entry_info?.deposited_atom_count || 0),
          sequence: '',
          functionText: `Experimentally determined macromolecular structure deposited in RCSB PDB (${methodVal}${
            resolutionVal ? `, ${Number(resolutionVal).toFixed(2)} Å resolution` : ''
          }).`,
          provenance: 'Experimentally determined',
          resolution: resolutionVal ? `${Number(resolutionVal).toFixed(2)} Å` : undefined,
          experimentalMethod: methodVal,
          sourceUrl: `https://www.rcsb.org/structure/${cleanInput}`,
          features: [],
          interproDomains: [],
          gtexTopTissues: [],
        });
        onStatusUpdate?.(`Loaded experimental PDB structure ${cleanInput}.`);
        return;
      }

      // Resolve gene symbol (e.g. TP53) -> UniProt accession if user typed a gene name instead of P04637
      let uniprotAcc = cleanInput;
      if (!/^[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/.test(cleanInput)) {
        const searchRes = await fetch(
          `https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(
            cleanInput
          )}+AND+organism_id:9606+AND+reviewed:true&format=json&size=1`
        );
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          if (searchJson?.results?.[0]?.primaryAccession) {
            uniprotAcc = searchJson.results[0].primaryAccession;
          }
        }
      }

      onStatusUpdate?.(`Fetching AlphaFold DB & UniProtKB records for ${uniprotAcc}...`);

      // Dynamic AlphaFold DB API metadata lookup (`_v6` safe!) + UniProtKB + InterPro
      const [afMetaRes, uniprotRes, interproRes] = await Promise.all([
        fetch(`https://alphafold.ebi.ac.uk/api/prediction/${uniprotAcc}`),
        fetch(`https://rest.uniprot.org/uniprotkb/${uniprotAcc}.json`),
        fetch(
          `https://www.ebi.ac.uk/interpro/api/entry/interpro/protein/uniprot/${uniprotAcc}?page_size=12`
        ).catch(() => null),
      ]);

      if (!afMetaRes.ok) {
        throw new Error(
          `No AlphaFold DB prediction found for "${cleanInput}". Try a UniProt accession (e.g. P04637) or 4-character PDB ID (e.g. 4HHB).`
        );
      }

      const afList = await afMetaRes.json();
      const afEntry = Array.isArray(afList) ? afList[0] : afList;
      const cifUrl =
        afEntry?.cifUrl || `https://alphafold.ebi.ac.uk/files/AF-${uniprotAcc}-F1-model_v6.cif`;

      const cifRes = await fetch(cifUrl);
      if (!cifRes.ok) {
        throw new Error(`Unable to download mmCIF coordinates from AlphaFold DB for ${uniprotAcc}.`);
      }
      const cifText = await cifRes.text();
      loadedCifRef.current = { cif: cifText, format: 'cif', isAlphaFold: true };

      const uni = uniprotRes.ok ? await uniprotRes.json() : null;
      const geneSym =
        uni?.genes?.[0]?.geneName?.value || afEntry?.gene || cleanInput;
      const proteinTitle =
        uni?.proteinDescription?.recommendedName?.fullName?.value ||
        afEntry?.uniprotDescription ||
        uniprotAcc;
      const organismName =
        uni?.organism?.scientificName || afEntry?.organismScientificName || 'Homo sapiens';
      const seqStr = uni?.sequence?.value || afEntry?.uniprotSequence || '';

      const funcComment = (uni?.comments || []).find((c: any) => c.commentType === 'FUNCTION');
      const functionText =
        funcComment?.texts?.[0]?.value ||
        'AlphaFold 3D monomer structure prediction colored by per-residue pLDDT confidence.';

      const parsedFeatures: UniProtFeatureItem[] = (uni?.features || [])
        .filter((f: any) =>
          ['Domain', 'Active site', 'Binding site', 'DNA binding', 'Region'].includes(f?.type)
        )
        .slice(0, 10)
        .map((f: any) => ({
          type: String(f.type || 'Feature'),
          description: String(f.description || f.type || 'Functional region'),
          start: Number(f?.location?.start?.value || 1),
          end: Number(f?.location?.end?.value || 1),
        }));

      let interproDomains: Array<{ accession: string; name: string; sourceDb: string }> = [];
      if (interproRes && interproRes.ok) {
        try {
          const ipJson = await interproRes.json();
          interproDomains = (ipJson?.results || []).slice(0, 8).map((r: any) => ({
            accession: String(r?.metadata?.accession || ''),
            name: String(r?.metadata?.name || ''),
            sourceDb: String(r?.metadata?.type || 'InterPro'),
          }));
        } catch {}
      }

      // GTEx Portal API v2 (`gencodeVersion=v39` & `datasetId=gtex_v10`)
      let gtexTopTissues: Array<{ tissue: string; medianTpm: number }> = [];
      if (geneSym) {
        try {
          const refRes = await fetch(
            `https://gtexportal.org/api/v2/reference/gene?geneId=${encodeURIComponent(
              geneSym
            )}&gencodeVersion=v39`
          );
          if (refRes.ok) {
            const refJson = await refRes.json();
            const gencodeId = refJson?.data?.[0]?.gencodeId;
            if (gencodeId) {
              const exprRes = await fetch(
                `https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=${encodeURIComponent(
                  gencodeId
                )}&datasetId=gtex_v10`
              );
              if (exprRes.ok) {
                const exprJson = await exprRes.json();
                gtexTopTissues = (exprJson?.data || [])
                  .map((d: any) => ({
                    tissue: String(d.tissueSiteDetailId || '').replace(/_/g, ' '),
                    medianTpm: Number(Number(d.median || 0).toFixed(1)),
                  }))
                  .sort((a: any, b: any) => b.medianTpm - a.medianTpm)
                  .slice(0, 6);
              }
            }
          }
        } catch {}
      }

      setProteinData({
        accession: uniprotAcc,
        proteinName: proteinTitle,
        geneSymbol: geneSym,
        organism: organismName,
        sequenceLength: seqStr.length || Number(afEntry?.uniprotEnd || 0),
        sequence: seqStr,
        functionText,
        provenance: 'Predicted by model',
        sourceUrl: `https://alphafold.ebi.ac.uk/entry/${uniprotAcc}`,
        paeImageUrl: afEntry?.paeImageUrl,
        features: parsedFeatures,
        interproDomains,
        gtexTopTissues,
      });
      onStatusUpdate?.(`Loaded AlphaFold structure ${uniprotAcc} (${geneSym}).`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load protein structure.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Load Chemistry & Drug Discovery (PubChem + SmilesDrawer + 3D SDF + ChEMBL + openFDA)
  const loadChemistryWorkbench = async (compoundInput: string) => {
    const cleanName = compoundInput.trim();
    if (!cleanName) return;

    setLoading(true);
    setErrorMsg('');
    onStatusUpdate?.(`Querying PubChem, ChEMBL & openFDA for "${cleanName}"...`);

    try {
      const cidRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
          cleanName
        )}/cids/JSON`
      );
      if (!cidRes.ok) {
        throw new Error(`Compound "${cleanName}" not found in PubChem.`);
      }
      const cidJson = await cidRes.json();
      const cid = Number(cidJson?.IdentifierList?.CID?.[0]);
      if (!cid) {
        throw new Error(`No PubChem CID resolved for "${cleanName}".`);
      }

      const [propRes, sdfRes, chemblMolRes, fdaRes] = await Promise.all([
        fetch(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount/JSON`
        ),
        fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`).catch(
          () => null
        ),
        fetch(
          `https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?q=${encodeURIComponent(
            cleanName
          )}&limit=1`
        ).catch(() => null),
        fetch(
          `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:${encodeURIComponent(
            cleanName
          )}&count=patient.reaction.reactionmeddrapt.exact`
        ).catch(() => null),
      ]);

      const propJson = await propRes.json();
      const p = propJson?.PropertyTable?.Properties?.[0] || {};
      const mw = Number(p.MolecularWeight || 0);
      const xlogp = Number(p.XLogP ?? 0);
      const tpsa = Number(p.TPSA ?? 0);
      const hbd = Number(p.HBondDonorCount ?? 0);
      const hba = Number(p.HBondAcceptorCount ?? 0);
      const rot = Number(p.RotatableBondCount ?? 0);

      let violations = 0;
      if (mw > 500) violations++;
      if (xlogp > 5) violations++;
      if (hbd > 5) violations++;
      if (hba > 10) violations++;

      let chemblActivities: CompoundSummaryState['chemblActivities'] = [];
      if (chemblMolRes && chemblMolRes.ok) {
        try {
          const molJson = await chemblMolRes.json();
          const molChemblId = molJson?.molecules?.[0]?.molecule_chembl_id;
          if (molChemblId) {
            const actRes = await fetch(
              `https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=${molChemblId}&standard_type=IC50&limit=6`
            );
            if (actRes.ok) {
              const actJson = await actRes.json();
              chemblActivities = (actJson?.activities || [])
                .filter((a: any) => a.standard_value)
                .slice(0, 5)
                .map((a: any) => ({
                  moleculeId: molChemblId,
                  assayType: String(a.target_pref_name || a.standard_type || 'IC50'),
                  value: String(a.standard_value),
                  units: String(a.standard_units || 'nM'),
                  pchembl: String(a.pchembl_value || '—'),
                }));
            }
          }
        } catch {}
      }

      let fdaTopReactions: Array<{ term: string; count: number }> = [];
      if (fdaRes && fdaRes.ok) {
        try {
          const fdaJson = await fdaRes.json();
          fdaTopReactions = (fdaJson?.results || []).slice(0, 5).map((r: any) => ({
            term: String(r.term || ''),
            count: Number(r.count || 0),
          }));
        } catch {}
      }

      const smilesStr = String(
        p.CanonicalSMILES || p.IsomericSMILES || p.ConnectivitySMILES || ''
      );

      setCompoundData({
        name: cleanName,
        cid,
        formula: String(p.MolecularFormula || ''),
        molecularWeight: mw,
        smiles: smilesStr,
        inchiKey: String(p.InChIKey || ''),
        xlogp,
        tpsa,
        hbd,
        hba,
        rotatableBonds: rot,
        lipinskiPass: violations <= 1,
        lipinskiViolations: violations,
        veberPass: rot <= 10 && tpsa <= 140,
        pubchem2dUrl: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=400x400`,
        chemblActivities,
        fdaTopReactions,
      });

      // Render 3D SDF conformer inside chem3dContainerRef if available
      if (sdfRes && sdfRes.ok && chem3dContainerRef.current) {
        const sdfText = await sdfRes.text();
        chem3dContainerRef.current.innerHTML = '';
        const viewer3d = ($3Dmol as any).createViewer(chem3dContainerRef.current, {
          backgroundColor: '#0f172a',
        });
        chem3dViewerRef.current = viewer3d;
        viewer3d.addModel(sdfText, 'sdf');
        viewer3d.setStyle(
          {},
          {
            stick: { radius: 0.2, colorscheme: 'Jmol' },
            sphere: { scale: 0.3, colorscheme: 'Jmol' },
          }
        );
        viewer3d.zoomTo();
        viewer3d.render();
      }

      onStatusUpdate?.(`Loaded compound ${cleanName} (PubChem CID ${cid}).`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to query compound data.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Load Genomics, ClinVar, gnomAD v4 Constraint & AlphaGenome Links
  const loadGenomicsWorkbench = async (geneInput: string, rsidInput: string) => {
    const cleanGene = geneInput.trim().toUpperCase() || 'TP53';
    const cleanRsid = rsidInput.trim().toLowerCase();

    setLoading(true);
    setErrorMsg('');
    onStatusUpdate?.(`Querying Ensembl, gnomAD v4 & NCBI ClinVar for ${cleanGene}...`);

    try {
      const ensemblRes = await fetch(
        `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${encodeURIComponent(
          cleanGene
        )}?expand=0;content-type=application/json`
      );
      if (!ensemblRes.ok) {
        throw new Error(`Gene symbol "${cleanGene}" was not found in human Ensembl GRCh38.`);
      }
      const ens = await ensemblRes.json();
      const chrom = String(ens.seq_region_name || '17').replace(/^chr/i, '');
      const start = Number(ens.start || 7668402);
      const end = Number(ens.end || 7687550);

      // gnomAD v4 GraphQL Gene Constraint
      let gnomadConstraint: GenomicsSummaryState['gnomadConstraint'];
      try {
        const gnomadRes = await fetch('https://gnomad.broadinstitute.org/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query GeneConstraint($geneSymbol: String!, $referenceGenome: ReferenceGenomeId!) {
              gene(gene_symbol: $geneSymbol, reference_genome: $referenceGenome) {
                symbol
                gnomad_constraint {
                  oe_lof
                  oe_lof_upper
                  pli
                  mis_z
                }
              }
            }`,
            variables: { geneSymbol: cleanGene, referenceGenome: 'GRCh38' },
          }),
        });
        if (gnomadRes.ok) {
          const gJson = await gnomadRes.json();
          const c = gJson?.data?.gene?.gnomad_constraint;
          if (c) {
            gnomadConstraint = {
              pli: c.pli != null ? Number(Number(c.pli).toFixed(3)) : null,
              oeLof: c.oe_lof != null ? Number(Number(c.oe_lof).toFixed(3)) : null,
              loeuf: c.oe_lof_upper != null ? Number(Number(c.oe_lof_upper).toFixed(3)) : null,
              misZ: c.mis_z != null ? Number(Number(c.mis_z).toFixed(2)) : null,
            };
          }
        }
      } catch {}

      // Ensembl VEP rsID lookup if provided
      let vepVariant: GenomicsSummaryState['vepVariant'];
      if (cleanRsid && /^rs\d+$/i.test(cleanRsid)) {
        try {
          const vepRes = await fetch(
            `https://rest.ensembl.org/vep/human/id/${encodeURIComponent(
              cleanRsid
            )}?content-type=application/json`
          );
          if (vepRes.ok) {
            const vepArr = await vepRes.json();
            const v0 = vepArr?.[0];
            if (v0) {
              const alleles = String(v0.allele_string || 'A/G').split('/');
              const vChrom = String(v0.seq_region_name || chrom).replace(/^chr/i, '');
              const vPos = Number(v0.start || start);
              vepVariant = {
                id: cleanRsid,
                alleleString: String(v0.allele_string || ''),
                mostSevereConsequence: String(v0.most_severe_consequence || '').replace(/_/g, ' '),
                chrom: vChrom,
                pos: vPos,
                alphaGenomeVariantUrl: buildAlphaGenomeAtlasUrl({
                  mode: 'variant',
                  chrom: vChrom,
                  pos: vPos,
                  ref: alleles[0] || 'A',
                  alt: alleles[1] || 'G',
                }),
              };
            }
          }
        } catch {}
      }

      // ClinVar pathogenic / clinical variants via NCBI E-utilities
      let clinvarItems: GenomicsSummaryState['clinvarItems'] = [];
      try {
        const esearchRes = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(
            `${cleanGene}[gene] AND clinsig_pathogenic[prop]`
          )}&retmode=json&retmax=6&tool=AIStudioBuild&email=scientist@example.com`
        );
        if (esearchRes.ok) {
          const esJson = await esearchRes.json();
          const ids: string[] = esJson?.esearchresult?.idlist || [];
          if (ids.length > 0) {
            const esumRes = await fetch(
              `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${ids.join(
                ','
              )}&retmode=json&tool=AIStudioBuild&email=scientist@example.com`
            );
            if (esumRes.ok) {
              const sumJson = await esumRes.json();
              clinvarItems = ids
                .map((uid) => {
                  const rec = sumJson?.result?.[uid];
                  if (!rec) return null;
                  const germ = rec.germline_classification || {};
                  const sig = String(
                    germ.description || rec.clinical_significance?.description || 'Pathogenic'
                  );
                  const rev = String(
                    germ.review_status || rec.clinical_significance?.review_status || ''
                  );
                  const trait =
                    germ?.trait_set?.[0]?.trait_name ||
                    rec?.trait_set?.[0]?.trait_name ||
                    'Hereditary condition';
                  return {
                    uid,
                    title: String(rec.title || uid),
                    significance: sig,
                    reviewStatus: rev,
                    stars: computeReviewStars(rev),
                    condition: String(trait),
                  };
                })
                .filter(Boolean) as GenomicsSummaryState['clinvarItems'];
            }
          }
        }
      } catch {}

      setGenomicsData({
        geneSymbol: cleanGene,
        ensemblId: String(ens.id || ''),
        biotype: String(ens.biotype || 'protein_coding').replace(/_/g, ' '),
        chrom,
        start,
        end,
        canonicalTranscript: String(ens.canonical_transcript || ''),
        alphaGenomeLocusUrl: buildAlphaGenomeAtlasUrl({ mode: 'locus', chrom, start, end }),
        gnomadConstraint,
        vepVariant,
        clinvarItems,
      });
      onStatusUpdate?.(`Loaded genomic & ClinVar profile for ${cleanGene}.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load genomic profile.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Load Biomedical Literature & Clinical Trials (Europe PMC + arXiv proxy + ClinicalTrials.gov v2)
  const loadLiteratureWorkbench = async (searchTopic: string) => {
    const cleanTopic = searchTopic.trim() || 'TP53';
    setLoading(true);
    setErrorMsg('');
    onStatusUpdate?.(`Searching Europe PMC, arXiv & ClinicalTrials.gov for "${cleanTopic}"...`);

    try {
      const [epmcRes, arxivRes, ctRes] = await Promise.all([
        fetch(
          `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
            cleanTopic
          )}&format=json&pageSize=6`
        ),
        fetch(
          `/api/science/arxiv?query=${encodeURIComponent(`all:${cleanTopic}`)}&max_results=5`
        ).catch(() => null),
        fetch(
          `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(
            cleanTopic
          )}&pageSize=5`
        ).catch(() => null),
      ]);

      const epmcJson = epmcRes.ok ? await epmcRes.json() : {};
      const europePmcPapers = (epmcJson?.resultList?.result || []).map((p: any) => ({
        id: String(p.pmid || p.id || ''),
        title: String(p.title || 'Untitled article'),
        authors: String(p.authorString || 'Authors unlisted'),
        journal: String(p.journalTitle || p.source || 'Biomedical Journal'),
        pubYear: String(p.pubYear || ''),
        citedByCount: Number(p.citedByCount || 0),
        isOpenAccess: p.isOpenAccess === 'Y',
        url: p.pmid
          ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`
          : `https://europepmc.org/article/${p.source || 'MED'}/${p.id}`,
      }));

      let arxivPreprints: LiteratureSummaryState['arxivPreprints'] = [];
      if (arxivRes && arxivRes.ok) {
        try {
          const xmlText = await arxivRes.text();
          const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
          arxivPreprints = Array.from(doc.getElementsByTagName('entry')).map((entry) => ({
            id: entry.getElementsByTagName('id')[0]?.textContent?.trim() || '',
            title:
              entry.getElementsByTagName('title')[0]?.textContent?.replace(/\s+/g, ' ').trim() ||
              '',
            summary:
              entry
                .getElementsByTagName('summary')[0]
                ?.textContent?.replace(/\s+/g, ' ')
                .trim()
                .slice(0, 260) || '',
            published: (entry.getElementsByTagName('published')[0]?.textContent || '').slice(0, 10),
          }));
        } catch {}
      }

      let clinicalTrials: LiteratureSummaryState['clinicalTrials'] = [];
      if (ctRes && ctRes.ok) {
        try {
          const ctJson = await ctRes.json();
          clinicalTrials = (ctJson?.studies || []).map((st: any) => {
            const proto = st?.protocolSection || {};
            const nctId = String(proto?.identificationModule?.nctId || '');
            const title = String(
              proto?.identificationModule?.briefTitle ||
                proto?.identificationModule?.officialTitle ||
                nctId
            );
            const status = String(proto?.statusModule?.overallStatus || 'UNKNOWN');
            const phases = (proto?.designModule?.phases || []).join(', ') || 'Observational / N/A';
            const interventions = (proto?.armsInterventionsModule?.interventions || [])
              .map((i: any) => i.name)
              .slice(0, 3)
              .join(', ');
            return { nctId, title, status, phases, interventions };
          });
        } catch {}
      }

      setLiteratureData({
        query: cleanTopic,
        europePmcPapers,
        arxivPreprints,
        clinicalTrials,
      });
      onStatusUpdate?.(`Loaded literature & clinical trial records for "${cleanTopic}".`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to query biomedical literature.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load default example (`TP53 · P04637`) on initial mount so user never lands on an empty state!
  useEffect(() => {
    loadProteinWorkbench('P04637', 'alphafold');
  }, []);

  const handleQuickExampleClick = (item: QuickExampleItem) => {
    setDomainTab(item.domain);
    if (item.domain === 'proteins' && item.proteinId) {
      setProteinQuery(item.proteinId);
      setProteinSourceMode(item.sourceMode || 'alphafold');
      loadProteinWorkbench(item.proteinId, item.sourceMode || 'alphafold');
    } else if (item.domain === 'chemistry' && item.compoundName) {
      setCompoundQuery(item.compoundName);
      loadChemistryWorkbench(item.compoundName);
    } else if (item.domain === 'genomics' && item.geneSymbol) {
      setGeneQuery(item.geneSymbol);
      if (item.rsid) setVariantQuery(item.rsid);
      loadGenomicsWorkbench(item.geneSymbol, item.rsid || '');
    }
  };

  return (
    <div className="w-full min-h-[580px] rounded-2xl border border-[#E2E8F0] dark:border-neutral-800 bg-[#F8FAFC] text-slate-900 dark:bg-[#07090e] dark:text-slate-100 flex flex-col overflow-hidden">
      {/* Workbench Header */}
      <div className="px-5 py-3.5 bg-white dark:bg-[#0c1017] border-b border-[#E2E8F0] dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="w-4 h-4 text-[#1A73E8]" />
          <h2 className="text-base font-display font-bold tracking-tight">
            Jarvis Bioscience Workbench
          </h2>
          <span className="text-[11px] font-mono text-slate-500">
            AlphaFold DB · PDB · UniProt · PubChem · ChEMBL · ClinVar · gnomAD · AlphaGenome
          </span>
        </div>

        {/* Domain Navigation */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'proteins', label: 'Proteins & 3D', icon: Atom },
              { id: 'chemistry', label: 'Chemistry & Drugs', icon: FlaskConical },
              { id: 'genomics', label: 'Genomics & Variants', icon: Dna },
              { id: 'literature', label: 'Literature & Trials', icon: BookOpen },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = domainTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setDomainTab(t.id);
                  if (t.id === 'chemistry' && !compoundData) loadChemistryWorkbench(compoundQuery);
                  if (t.id === 'genomics' && !genomicsData)
                    loadGenomicsWorkbench(geneQuery, variantQuery);
                  if (t.id === 'literature' && !literatureData)
                    loadLiteratureWorkbench(literatureQuery);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-[#1A73E8] text-white'
                    : 'bg-[#F8FAFC] dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-[#E2E8F0] dark:border-slate-800 hover:border-[#1A73E8]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Top Quick-Try Example Bar (Mandatory per Science Skill) */}
      <div className="px-5 py-2 bg-white/80 dark:bg-[#0a0d14] border-b border-[#E2E8F0] dark:border-neutral-800 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="font-semibold text-slate-500 shrink-0">Quick-Try Targets:</span>
        {QUICK_TRY_EXAMPLES.map((ex, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleQuickExampleClick(ex)}
            disabled={loading}
            className="shrink-0 px-2.5 py-1 rounded-md border border-[#E2E8F0] dark:border-slate-800 bg-white hover:bg-blue-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px] transition cursor-pointer"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="mx-5 mt-4 p-3 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* ==================== TAB 1: PROTEINS & 3D STRUCTURE ==================== */}
      {domainTab === 'proteins' && (
        <div className="p-5 space-y-4 flex-1">
          {/* Search Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadProteinWorkbench(proteinQuery, proteinSourceMode);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <div className="flex items-center rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setProteinSourceMode('alphafold')}
                className={`px-2.5 py-1.5 rounded-md font-medium cursor-pointer ${
                  proteinSourceMode === 'alphafold'
                    ? 'bg-[#1A73E8] text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                AlphaFold DB
              </button>
              <button
                type="button"
                onClick={() => setProteinSourceMode('pdb')}
                className={`px-2.5 py-1.5 rounded-md font-medium cursor-pointer ${
                  proteinSourceMode === 'pdb'
                    ? 'bg-[#0D9488] text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                RCSB PDB
              </button>
            </div>

            <input
              type="text"
              value={proteinQuery}
              onChange={(e) => setProteinQuery(e.target.value)}
              placeholder={
                proteinSourceMode === 'pdb'
                  ? 'Enter 4-char PDB ID (e.g. 4HHB, 1TUP, 7KRR)...'
                  : 'Enter UniProt accession or human gene symbol (e.g. P04637, TP53, BRCA1, EGFR)...'
              }
              className="flex-1 min-w-[220px] rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
            />

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Load 3D Structure</span>
            </button>

            {proteinData && onExplainInChat && (
              <button
                type="button"
                onClick={() =>
                  onExplainInChat(
                    `Explain ${proteinData.geneSymbol} (${proteinData.proteinName}) and show its picture`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#0D9488] text-[#0D9488] dark:text-teal-300 text-xs font-semibold hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Explain with Picture in Chat</span>
              </button>
            )}
          </form>

          {/* Split Interactive 3D Canvas + Synchronized Data Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Pane (7 cols): WebGL 3Dmol.js Structure Viewport */}
            <div className="lg:col-span-7 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] overflow-hidden flex flex-col">
              {/* Viewport Controls */}
              <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1">
                  {(['cartoon', 'stick', 'sphere', 'line'] as ViewerRenderStyle[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setViewerStyle(st)}
                      className={`px-2.5 py-1 rounded font-medium capitalize cursor-pointer ${
                        viewerStyle === st
                          ? 'bg-[#1A73E8] text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      proteinViewerInstanceRef.current?.zoom(1.25);
                      proteinViewerInstanceRef.current?.render();
                    }}
                    className="p-1.5 rounded border border-[#E2E8F0] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      proteinViewerInstanceRef.current?.zoom(0.8);
                      proteinViewerInstanceRef.current?.render();
                    }}
                    className="p-1.5 rounded border border-[#E2E8F0] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      proteinViewerInstanceRef.current?.zoomTo();
                      proteinViewerInstanceRef.current?.render();
                    }}
                    className="p-1.5 rounded border border-[#E2E8F0] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    title="Reset Camera"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSpinning((s) => !s)}
                    className={`px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                      isSpinning
                        ? 'border-[#0D9488] bg-[#0D9488] text-white'
                        : 'border-[#E2E8F0] dark:border-slate-700'
                    }`}
                  >
                    Spin
                  </button>
                  <button
                    type="button"
                    onClick={() => setDarkViewport((d) => !d)}
                    className="p-1.5 rounded border border-[#E2E8F0] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    title="Toggle Light / Dark 3D Canvas"
                  >
                    <SunMoon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bounded 3Dmol WebGL Canvas */}
              <div
                ref={proteinViewerContainerRef}
                className="relative w-full h-[390px]"
              />

              {/* Canonical 4-Band AlphaFold pLDDT Confidence Legend */}
              <div className="px-3.5 py-2.5 border-t border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                    AlphaFold pLDDT:
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#0053D6]" />
                    <span>Very High (&gt;90)</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#65CBF3]" />
                    <span>Confident (70–90)</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#FFDB13]" />
                    <span>Low (50–70)</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#FF7D45]" />
                    <span>Very Low (&lt;50)</span>
                  </span>
                </div>
                {clickedAtomInfo && (
                  <span className="font-mono font-semibold text-[#1A73E8] dark:text-sky-400">
                    {clickedAtomInfo}
                  </span>
                )}
              </div>
            </div>

            {/* Right Pane (5 cols): Synchronized Metadata, Domains & GTEx Expression Inspector */}
            <div className="lg:col-span-5 space-y-3 max-h-[495px] overflow-y-auto pr-1">
              {proteinData && (
                <>
                  <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          proteinData.provenance === 'Experimentally determined'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-blue-50 text-[#1A73E8] border border-blue-200 dark:bg-blue-950/50 dark:text-sky-300 dark:border-blue-800'
                        }`}
                      >
                        [{proteinData.provenance}]
                      </span>

                      <a
                        href={proteinData.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A73E8] hover:underline"
                      >
                        <span>
                          {proteinData.provenance === 'Experimentally determined'
                            ? 'RCSB PDB'
                            : 'AlphaFold DB'}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div>
                      <h3 className="text-base font-display font-bold">
                        {proteinData.proteinName}
                      </h3>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">
                        Accession: {proteinData.accession} · Gene: {proteinData.geneSymbol} ·{' '}
                        {proteinData.organism}
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-4">
                      {proteinData.functionText}
                    </p>
                  </div>

                  {/* Click-to-Highlight Functional Domains */}
                  {proteinData.features.length > 0 && (
                    <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">
                          UniProt Domains &amp; Sites (Click to focus 3D)
                        </span>
                        <a
                          href={`https://www.uniprot.org/uniprotkb/${proteinData.accession}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#1A73E8] hover:underline inline-flex items-center gap-1"
                        >
                          <span>UniProtKB</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="space-y-1.5">
                        {proteinData.features.map((feat, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              highlightResidueSpan(feat.start, feat.end, feat.description)
                            }
                            className="w-full text-left px-3 py-2 rounded-lg border border-[#E2E8F0] dark:border-slate-800 hover:border-[#0D9488] bg-[#F8FAFC] dark:bg-slate-900 flex items-center justify-between text-xs transition cursor-pointer"
                          >
                            <span className="font-medium truncate pr-2">
                              {feat.type}: {feat.description}
                            </span>
                            <span className="font-mono text-[11px] text-[#0D9488] shrink-0">
                              aa {feat.start}–{feat.end}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* GTEx v10 Baseline Human Tissue Expression */}
                  {proteinData.gtexTopTissues.length > 0 && (
                    <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold">GTEx v10 Top Human Tissue Expression</span>
                        <span className="font-mono text-[10px] text-slate-500">Median TPM</span>
                      </div>
                      <div className="space-y-1.5">
                        {proteinData.gtexTopTissues.map((t, idx) => {
                          const maxTpm = Math.max(
                            1,
                            proteinData.gtexTopTissues[0]?.medianTpm || 1
                          );
                          const widthPct = Math.max(6, Math.round((t.medianTpm / maxTpm) * 100));
                          return (
                            <div key={idx} className="space-y-0.5 text-[11px]">
                              <div className="flex justify-between">
                                <span className="truncate max-w-[200px]">{t.tissue}</span>
                                <span className="font-mono font-semibold">{t.medianTpm} TPM</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-[#0D9488]"
                                  style={{ width: `${widthPct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: CHEMISTRY & DRUG DISCOVERY ==================== */}
      {domainTab === 'chemistry' && (
        <div className="p-5 space-y-4 flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadChemistryWorkbench(compoundQuery);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={compoundQuery}
              onChange={(e) => setCompoundQuery(e.target.value)}
              placeholder="Enter compound or drug name (e.g. imatinib, aspirin, osimertinib, caffeine)..."
              className="flex-1 min-w-[240px] rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Analyze Compound</span>
            </button>

            {compoundData && onExplainInChat && (
              <button
                type="button"
                onClick={() =>
                  onExplainInChat(
                    `Explain the compound ${compoundData.name} (${compoundData.formula}) with its structure picture`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#0D9488] text-[#0D9488] dark:text-teal-300 text-xs font-semibold cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Explain with Picture in Chat</span>
              </button>
            )}
          </form>

          {compoundData && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* 2D SMILES + PubChem 2D + 3D Conformer */}
              <div className="lg:col-span-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] flex flex-col items-center">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">
                      PubChem 2D Depiction
                    </div>
                    <img
                      src={compoundData.pubchem2dUrl}
                      alt={compoundData.name}
                      referrerPolicy="no-referrer"
                      className="w-48 h-48 object-contain bg-white rounded-lg"
                    />
                  </div>
                  <div className="p-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] flex flex-col items-center">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">
                      SmilesDrawer 2D Graph
                    </div>
                    <canvas
                      ref={smilesCanvasRef}
                      width={280}
                      height={240}
                      className="w-48 h-48 bg-white rounded-lg"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-[#E2E8F0] dark:border-slate-800 text-xs font-bold flex items-center justify-between">
                    <span>PubChem 3D Conformer (`3Dmol.js` SDF)</span>
                    <a
                      href={`https://pubchem.ncbi.nlm.nih.gov/compound/${compoundData.cid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1A73E8] hover:underline inline-flex items-center gap-1"
                    >
                      <span>CID {compoundData.cid}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div ref={chem3dContainerRef} className="relative w-full h-56" />
                </div>
              </div>

              {/* Physicochemical Properties, Lipinski/Veber Rules, ChEMBL & openFDA */}
              <div className="lg:col-span-6 space-y-3">
                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-display font-bold capitalize">
                        {compoundData.name}
                      </h3>
                      <div className="text-xs font-mono text-slate-500">
                        Formula: {compoundData.formula} · MW: {compoundData.molecularWeight} Da
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                          compoundData.lipinskiPass
                            ? 'bg-emerald-50 text-[#059669] border border-emerald-200 dark:bg-emerald-950/50'
                            : 'bg-amber-50 text-[#D97706] border border-amber-200 dark:bg-amber-950/50'
                        }`}
                      >
                        Lipinski Ro5: {compoundData.lipinskiPass ? 'PASS' : 'WARN'} (
                        {compoundData.lipinskiViolations} viol.)
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                          compoundData.veberPass
                            ? 'bg-emerald-50 text-[#059669] border border-emerald-200 dark:bg-emerald-950/50'
                            : 'bg-amber-50 text-[#D97706] border border-amber-200 dark:bg-amber-950/50'
                        }`}
                      >
                        Veber: {compoundData.veberPass ? 'PASS' : 'WARN'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                      <div className="text-[10px] text-slate-500">XLogP</div>
                      <div className="font-mono font-bold">{compoundData.xlogp}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                      <div className="text-[10px] text-slate-500">TPSA</div>
                      <div className="font-mono font-bold">{compoundData.tpsa} Å²</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                      <div className="text-[10px] text-slate-500">HBD / HBA / Rot</div>
                      <div className="font-mono font-bold">
                        {compoundData.hbd} / {compoundData.hba} / {compoundData.rotatableBonds}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 break-all">
                    <strong>SMILES:</strong> {compoundData.smiles}
                  </div>
                </div>

                {compoundData.chemblActivities.length > 0 && (
                  <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2">
                    <div className="text-xs font-bold">
                      ChEMBL Measured Bioactivities (`IC50` / `pChEMBL`) [Experimentally determined]
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {compoundData.chemblActivities.map((act, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 rounded bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between"
                        >
                          <span className="truncate pr-2">{act.assayType}</span>
                          <span className="font-mono font-semibold text-[#0D9488] shrink-0">
                            {act.value} {act.units} (pChEMBL {act.pchembl})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {compoundData.fdaTopReactions.length > 0 && (
                  <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2">
                    <div className="text-xs font-bold">
                      openFDA FAERS Top Reported Adverse Events [Literature / Pharmacovigilance]
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {compoundData.fdaTopReactions.map((r, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-md border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900 text-[11px] font-mono"
                        >
                          {r.term} ({r.count.toLocaleString()})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: GENOMICS & VARIANTS ==================== */}
      {domainTab === 'genomics' && (
        <div className="p-5 space-y-4 flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadGenomicsWorkbench(geneQuery, variantQuery);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={geneQuery}
              onChange={(e) => setGeneQuery(e.target.value)}
              placeholder="Human gene symbol (e.g. TP53, BRCA1, EGFR, AGT)..."
              className="flex-1 min-w-[180px] rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
            />
            <input
              type="text"
              value={variantQuery}
              onChange={(e) => setVariantQuery(e.target.value)}
              placeholder="Optional rsID (e.g. rs699)..."
              className="w-48 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Query Genomics</span>
            </button>
          </form>

          {genomicsData && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Gene Model, AlphaGenome Atlas Link & gnomAD Constraint */}
              <div className="lg:col-span-5 space-y-3">
                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-display font-bold">{genomicsData.geneSymbol}</h3>
                    <span className="font-mono text-xs text-slate-500">
                      {genomicsData.ensemblId}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    GRCh38: chr{genomicsData.chrom}:{genomicsData.start.toLocaleString()}–
                    {genomicsData.end.toLocaleString()} ({genomicsData.biotype})
                  </div>

                  <a
                    href={genomicsData.alphaGenomeLocusUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold hover:opacity-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Open Locus in DeepMind AlphaGenome Atlas</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {genomicsData.gnomadConstraint && (
                  <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold">gnomAD v4 Gene Constraint</span>
                      <a
                        href={`https://gnomad.broadinstitute.org/gene/${genomicsData.ensemblId}?dataset=gnomad_r4`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1A73E8] hover:underline inline-flex items-center gap-1"
                      >
                        <span>gnomAD</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">pLI (LoF Intolerance)</div>
                        <div className="font-mono font-bold">
                          {genomicsData.gnomadConstraint.pli ?? '—'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">LOEUF (`oe_lof_upper`)</div>
                        <div className="font-mono font-bold">
                          {genomicsData.gnomadConstraint.loeuf ?? '—'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">Obs/Exp LoF (`oe_lof`)</div>
                        <div className="font-mono font-bold">
                          {genomicsData.gnomadConstraint.oeLof ?? '—'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                        <div className="text-[10px] text-slate-500">Missense Z (`mis_z`)</div>
                        <div className="font-mono font-bold">
                          {genomicsData.gnomadConstraint.misZ ?? '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {genomicsData.vepVariant && (
                  <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2">
                    <div className="text-xs font-bold">
                      Ensembl VEP Variant Annotation · {genomicsData.vepVariant.id}
                    </div>
                    <div className="text-xs font-mono">
                      chr{genomicsData.vepVariant.chrom}:{genomicsData.vepVariant.pos} (
                      {genomicsData.vepVariant.alleleString}) ·{' '}
                      <span className="font-semibold text-[#0D9488]">
                        {genomicsData.vepVariant.mostSevereConsequence}
                      </span>
                    </div>
                    <a
                      href={genomicsData.vepVariant.alphaGenomeVariantUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A73E8] hover:underline"
                    >
                      <span>Predict Variant Tracks in AlphaGenome Atlas</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* ClinVar Pathogenic Variants */}
              <div className="lg:col-span-7 p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">
                    NCBI ClinVar Pathogenic Variants &amp; ACMG Review Stars [Literature curated]
                  </span>
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(
                      genomicsData.geneSymbol
                    )}[gene]`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1A73E8] hover:underline inline-flex items-center gap-1"
                  >
                    <span>ClinVar</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {genomicsData.clinvarItems.length === 0 ? (
                  <div className="text-xs text-slate-500 py-6 text-center">
                    No pathogenic ClinVar entries returned for {genomicsData.geneSymbol}.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {genomicsData.clinvarItems.map((cv) => (
                      <div
                        key={cv.uid}
                        className="p-3 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-mono font-bold truncate max-w-md">{cv.title}</div>
                          <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                            Condition: {cv.condition} · Review: {'★'.repeat(cv.stars)}
                            {'☆'.repeat(4 - cv.stars)} ({cv.reviewStatus || 'reported'})
                          </div>
                        </div>
                        <span className="px-2.5 py-0.5 rounded bg-red-50 dark:bg-red-950/60 text-[#DC2626] dark:text-red-300 border border-red-200 dark:border-red-800 font-semibold text-[11px]">
                          {cv.significance}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 4: LITERATURE & CLINICAL TRIALS ==================== */}
      {domainTab === 'literature' && (
        <div className="p-5 space-y-4 flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadLiteratureWorkbench(literatureQuery);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={literatureQuery}
              onChange={(e) => setLiteratureQuery(e.target.value)}
              placeholder="Search Europe PMC, PubMed, arXiv & ClinicalTrials.gov (e.g. CRISPR sickle cell, TP53 AlphaFold)..."
              className="flex-1 min-w-[240px] rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Search Literature &amp; Trials</span>
            </button>
          </form>

          {literatureData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Europe PMC & arXiv */}
              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2.5">
                  <div className="text-xs font-bold">
                    Europe PMC / PubMed Peer-Reviewed Articles [Literature curated]
                  </div>
                  {literatureData.europePmcPapers.map((p, idx) => (
                    <a
                      key={idx}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg border border-[#E2E8F0] dark:border-slate-800 hover:border-[#1A73E8] bg-[#F8FAFC] dark:bg-slate-900 space-y-1 transition"
                    >
                      <div className="text-xs font-semibold text-[#1A73E8] dark:text-sky-400">
                        {p.title}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        {p.authors}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {p.journal} ({p.pubYear}) · Citations: {p.citedByCount}
                        {p.isOpenAccess ? ' · Open Access' : ''}
                      </div>
                    </a>
                  ))}
                </div>

                {literatureData.arxivPreprints.length > 0 && (
                  <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2">
                    <div className="text-xs font-bold">arXiv Quantitative Biology Preprints</div>
                    {literatureData.arxivPreprints.map((arx, idx) => (
                      <a
                        key={idx}
                        href={arx.id}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900 text-xs space-y-1"
                      >
                        <div className="font-semibold text-[#0D9488]">{arx.title}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                          {arx.summary}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* ClinicalTrials.gov v2 */}
              <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0c1017] space-y-2.5">
                <div className="text-xs font-bold">
                  ClinicalTrials.gov Registered Studies (API v2)
                </div>
                {literatureData.clinicalTrials.length === 0 ? (
                  <div className="text-xs text-slate-500 py-6 text-center">
                    No registered trials matched "{literatureData.query}".
                  </div>
                ) : (
                  literatureData.clinicalTrials.map((ct) => (
                    <a
                      key={ct.nctId}
                      href={`https://clinicaltrials.gov/study/${ct.nctId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg border border-[#E2E8F0] dark:border-slate-800 hover:border-[#0D9488] bg-[#F8FAFC] dark:bg-slate-900 space-y-1 transition"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="font-bold text-[#1A73E8]">{ct.nctId}</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-[#059669] font-semibold">
                          {ct.status}
                        </span>
                      </div>
                      <div className="text-xs font-semibold">{ct.title}</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Phase: {ct.phases}
                        {ct.interventions ? ` · Interventions: ${ct.interventions}` : ''}
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
