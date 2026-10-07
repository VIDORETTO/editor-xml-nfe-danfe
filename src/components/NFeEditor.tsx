import React, { useState, useMemo, useCallback, useEffect, useId } from 'react';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import { 
  FileUp, 
  Download, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  ChevronRight,
  ChevronDown,
  Save,
  Package,
  User,
  Building,
  CreditCard,
  Truck,
  FileText,
  MessageSquare,
  Landmark,
  Cpu,
  Wand2,
  Lock,
  Moon,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { calculateNfeTotals } from '@/src/lib/nfe-money';
import { NFeDocument, ValidationError } from '@/src/types/nfe';

// Initial state for a blank NFe
const BLANK_NFE: NFeDocument = {
  nfeProc: {
    "@_versao": "4.00",
    "@_xmlns": "http://www.portalfiscal.inf.br/nfe",
    NFe: {
      infNFe: {
        "@_Id": `NFe${Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('')}`,
        "@_versao": "4.00",
        ide: {
          cUF: "35",
          cNF: "12345678",
          natOp: "VENDA",
          mod: "55",
          serie: "1",
          nNF: "1",
          dhEmi: new Date().toISOString().split('.')[0] + "-03:00",
          tpNF: "1",
          idDest: "1",
          cMunFG: "3550308",
          tpImp: "1",
          tpEmis: "1",
          cDV: "1",
          tpAmb: "1",
          finNFe: "1",
          indFinal: "0",
          indPres: "0",
          procEmi: "0",
          verProc: "1.0.0"
        },
        emit: {
          CNPJ: "",
          xNome: "",
          xFant: "",
          enderEmit: {
            xLgr: "",
            nro: "",
            xBairro: "",
            cMun: "",
            xMun: "",
            UF: "",
            CEP: "",
            cPais: "1058",
            xPais: "BRASIL"
          },
          IE: "",
          CRT: "3"
        },
        dest: {
          CNPJ: "",
          xNome: "",
          enderDest: {
            xLgr: "",
            nro: "",
            xBairro: "",
            cMun: "",
            xMun: "",
            UF: "",
            CEP: "",
            cPais: "1058",
            xPais: "BRASIL"
          },
          indIEDest: "1",
          IE: ""
        },
        det: [],
        total: {
          ICMSTot: {
            vBC: "0.00",
            vICMS: "0.00",
            vICMSDeson: "0.00",
            vFCP: "0.00",
            vBCST: "0.00",
            vST: "0.00",
            vFCPST: "0.00",
            vFCPSTRet: "0.00",
            vProd: "0.00",
            vFrete: "0.00",
            vSeg: "0.00",
            vDesc: "0.00",
            vII: "0.00",
            vIPI: "0.00",
            vIPIDevol: "0.00",
            vPIS: "0.00",
            vCOFINS: "0.00",
            vOutro: "0.00",
            vNF: "0.00"
          }
        },
        transp: {
          modFrete: "0"
        },
        pag: {
          detPag: {
            tPag: "01",
            vPag: "0.00"
          }
        }
      }
    }
  }
};

const MAX_XML_FILE_SIZE = 10 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false, // CRITICAL: Stop converting strings to numbers to preserve leading zeros
  parseTagValue: false,       // CRITICAL: Stop converting tag values
  allowBooleanAttributes: true,
  trimValues: true
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  suppressEmptyNode: true,
  indentBy: "  "
});

const PAYMENT_METHODS = [
  { v: '01', l: 'Dinheiro' },
  { v: '02', l: 'Cheque' },
  { v: '03', l: 'Cartão de Crédito' },
  { v: '04', l: 'Cartão de Débito' },
  { v: '15', l: 'Boleto Bancário' },
  { v: '17', l: 'PIX' },
  { v: '90', l: 'Sem Pagamento' },
  { v: '99', l: 'Outros' },
];

// Helper to pad values
const padVal = (val: string, length: number) => {
  if (!val) return val;
  const digits = val.replace(/\D/g, '');
  if (!digits) return val;
  return digits.length < length ? digits.padStart(length, '0') : digits;
};

// Helper to clean IE
const cleanIE = (ie: string) => (ie || '').toString().replace(/\D/g, '');

// Helper to reorder object keys
const reorderObject = (obj: any, order: string[]) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const newObj: any = {};
  const keys = Object.keys(obj);
  
  // 1. Attributes first
  keys.filter(k => k.startsWith('@_')).forEach(k => newObj[k] = obj[k]);
  
  // 2. Ordered keys
  order.forEach(k => {
    if (obj[k] !== undefined) {
      if (typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
          // Recursive? Maybe not needed for all, but good for some
          newObj[k] = obj[k];
      } else {
          newObj[k] = obj[k];
      }
    }
  });
  
  // 3. Remaining keys
  keys.forEach(k => {
    if (!k.startsWith('@_') && !order.includes(k)) {
      newObj[k] = obj[k];
    }
  });
  
  return newObj;
};

export default function NFeEditor() {
  const [doc, setDoc] = useState<NFeDocument>(BLANK_NFE);
  const [uploadNotice, setUploadNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [calculationNotice, setCalculationNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('sobre');
  const [viewXml, setViewTab] = useState<'form' | 'xml'>('form');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const revealActiveTab = () => {
      document.getElementById(`mobile-tab-${activeTab}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    revealActiveTab();
    window.addEventListener('resize', revealActiveTab);
    return () => window.removeEventListener('resize', revealActiveTab);
  }, [activeTab]);

  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    setIsDarkMode(isDark);
  };

  const xmlPreview = useMemo(() => {
    try {
      // Deep clone for formatting
      const cleanDoc = JSON.parse(JSON.stringify(doc));
      
      // 1. Remove duplicate declarations if somehow present in object
      if (cleanDoc['?xml']) delete cleanDoc['?xml'];

      // 2. Normalize nfeProc
      if (cleanDoc.nfeProc["@_versao"] === "4") cleanDoc.nfeProc["@_versao"] = "4.00";
      if (cleanDoc.nfeProc.versao) delete cleanDoc.nfeProc.versao;

      const nfe = cleanDoc.nfeProc.NFe;
      const inf = nfe.infNFe;
      
      // 3. Normalize version and remove Id tag
      if (inf["@_versao"] === "4") inf["@_versao"] = "4.00";
      if (inf.Id) delete inf.Id;
      if (inf.versao) delete inf.versao;
      
      // Ensure Chave is string
      if (inf.ide.cNF && typeof inf.ide.cNF === 'number') inf.ide.cNF = inf.ide.cNF.toString();
      
      // 4. PRECISE TAG ORDERING (CRITICAL for XSD Validation)
      
      // Order infNFe
      cleanDoc.nfeProc.NFe.infNFe = reorderObject(inf, [
        'ide', 'emit', 'dest', 'det', 'total', 'transp', 'cobr', 'pag', 'infAdic', 'infRespTec'
      ]);

      const infReordered = cleanDoc.nfeProc.NFe.infNFe;

      // Order dest
      if (infReordered.dest) {
        infReordered.dest = reorderObject(infReordered.dest, [
          'CNPJ', 'CPF', 'xEstrangeiro', 'xNome', 'enderDest', 'indIEDest', 'IE', 'email'
        ]);
      }

      // Order emit
      if (infReordered.emit) {
        infReordered.emit = reorderObject(infReordered.emit, [
          'CNPJ', 'CPF', 'xNome', 'xFant', 'enderEmit', 'IE', 'IEST', 'IM', 'CNAE', 'CRT'
        ]);
      }

      // Order items
      if (infReordered.det) {
        const detArray = Array.isArray(infReordered.det) ? infReordered.det : [infReordered.det];
        infReordered.det = detArray.map((item: any) => {
          const itemOrdered = reorderObject(item, ['prod', 'imposto', 'infAdProd']);
          if (itemOrdered.prod) {
            itemOrdered.prod = reorderObject(itemOrdered.prod, [
              'cProd', 'cEAN', 'xProd', 'NCM', 'CEST', 'CFOP', 'uCom', 'qCom', 'vUnCom', 'vProd', 
              'cEANTrib', 'uTrib', 'qTrib', 'vUnTrib', 'vFrete', 'vSeg', 'vDesc', 'vOutro', 'indTot'
            ]);
          }
          return itemOrdered;
        });
      }

      // Final nfeProc order
      cleanDoc.nfeProc = reorderObject(cleanDoc.nfeProc, ['NFe', 'protNFe']);

      return `<?xml version="1.0" encoding="utf-8"?>\n` + builder.build(cleanDoc);
    } catch (e) {
      console.error("XML Build Error:", e);
      return "Erro ao gerar XML";
    }
  }, [doc]);

  const validate = useCallback(() => {
    const errors: ValidationError[] = [];
    const infNFe = doc.nfeProc.NFe.infNFe;
    const protNFe = doc.nfeProc.protNFe;

    // Basic mandatory fields
    if (!infNFe.emit.CNPJ && !infNFe.emit.CPF) errors.push({ path: 'emit', message: 'CNPJ/CPF do emitente é obrigatório', section: 'emit' });
    if (!infNFe.emit.xNome) errors.push({ path: 'emit.xNome', message: 'Razão Social do emitente é obrigatória', section: 'emit' });
    
    // Destinatário
    if (!infNFe.dest.CNPJ && !infNFe.dest.CPF) errors.push({ path: 'dest', message: 'CNPJ ou CPF do destinatário é obrigatório', section: 'dest' });
    
    // Fiscal Validity Warnings
    if (protNFe) {
      errors.push({ 
        path: 'fiscal', 
        message: 'Aviso de Integridade: Este XML possui Protocolo de Autorização. Alterações tornam o XML secundário (sem valor jurídico) se não re-assinado.', 
        section: 'fiscal',
        type: 'warning'
      });
    }

    // Key validation
    const chNFe = infNFe.ide.cNF || '';
    if (chNFe.includes('+') || chNFe.includes('e')) {
      errors.push({ 
        path: 'ide.cNF', 
        message: 'Chave corrompida (notação científica). Corrija informando os dígitos exatos.', 
        section: 'ide',
        type: 'error'
      });
    }

    return errors;
  }, [doc]);

  const errors = useMemo(() => validate(), [validate]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setUploadNotice(null);
    if (file.size > MAX_XML_FILE_SIZE) {
      setUploadNotice({ kind: 'error', text: 'O arquivo excede o limite de 10 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const xml = event.target?.result;
        if (typeof xml !== 'string' || !xml.trim()) {
          throw new Error('O arquivo está vazio ou não pôde ser lido como texto.');
        }

        const validation = XMLValidator.validate(xml);
        if (validation !== true) {
          throw new Error(`O XML está malformado (linha ${validation.err.line}, coluna ${validation.err.col}).`);
        }

        const parsed = parser.parse(xml);
        let nfeProc = parsed?.nfeProc;
        if (!nfeProc && parsed?.NFe) {
          nfeProc = {
            ...parsed,
            '@_xmlns': parsed['@_xmlns'] || 'http://www.portalfiscal.inf.br/nfe',
            '@_versao': parsed['@_versao'] || '4.00',
          };
        }

        const inf = nfeProc?.NFe?.infNFe;
        if (!inf || typeof inf !== 'object') {
          throw new Error('O arquivo não contém uma NF-e reconhecível. Selecione um XML completo de NF-e 4.00.');
        }

        const namespace = nfeProc['@_xmlns'] || nfeProc.NFe['@_xmlns'];
        if (namespace && namespace !== 'http://www.portalfiscal.inf.br/nfe') {
          throw new Error('O arquivo usa um namespace XML incompatível com a NF-e.');
        }

        if (nfeProc['@_versao'] && !['4', '4.00'].includes(String(nfeProc['@_versao']))) {
          throw new Error(`Versão de processamento ${nfeProc['@_versao']} não é compatível com este editor.`);
        }

        const missing = [
          ['Identificação', inf.ide],
          ['Emitente', inf.emit],
          ['Endereço do emitente', inf.emit?.enderEmit],
          ['Destinatário', inf.dest],
          ['Produtos', inf.det],
          ['Totais', inf.total?.ICMSTot],
          ['Transporte', inf.transp],
          ['Pagamento', inf.pag],
        ].find(([, value]) => !value || typeof value !== 'object');
        if (missing) {
          throw new Error(`A NF-e está incompleta: falta a seção ${missing[0]}.`);
        }

        if (!['4', '4.00'].includes(String(inf['@_versao'] ?? ''))) {
          throw new Error(`Versão ${inf['@_versao'] || 'não informada'} não é compatível. Este editor aceita NF-e 4.00.`);
        }
        inf['@_versao'] = '4.00';
        nfeProc['@_xmlns'] ||= 'http://www.portalfiscal.inf.br/nfe';
        nfeProc['@_versao'] ||= '4.00';

        const details = inf.det ? (Array.isArray(inf.det) ? inf.det : [inf.det]) : [];
        if (details.length === 0) {
          throw new Error('A NF-e precisa conter ao menos um produto.');
        }
        if (details.some((item: any) => !item?.prod || !item?.imposto)) {
          throw new Error('A NF-e contém um produto sem os dados de produto ou imposto necessários.');
        }
        inf.det = details;
        const payments = inf.pag.detPag === undefined
          ? []
          : Array.isArray(inf.pag.detPag) ? inf.pag.detPag : [inf.pag.detPag];
        if (payments.some((item: any) => !item || typeof item !== 'object')) {
          throw new Error('A NF-e contém uma forma de pagamento inválida.');
        }
        inf.pag.detPag = payments;

        setDoc({ nfeProc });
        setCalculationNotice(null);
        setActiveTab('ide');
        setUploadNotice({ kind: 'success', text: 'XML carregado no navegador. Os dados permanecem nesta sessão.' });
      } catch (error) {
        setUploadNotice({
          kind: 'error',
          text: error instanceof Error ? error.message : 'Não foi possível abrir este XML.',
        });
      }
    };
    reader.onerror = () => {
      setUploadNotice({ kind: 'error', text: 'Não foi possível ler o arquivo XML local.' });
    };
    reader.readAsText(file);
  };

  const updateField = (path: string, value: any) => {
    setCalculationNotice(null);
    setDoc(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let current = next.nfeProc.NFe.infNFe;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const updatePaymentField = (index: number, field: 'tPag' | 'vPag', value: string) => {
    setCalculationNotice(null);
    setDoc(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as NFeDocument;
      const current = next.nfeProc.NFe.infNFe.pag.detPag;
      const payments = Array.isArray(current) ? current : [current];
      if (!payments[index]) return prev;
      payments[index] = { ...payments[index], [field]: value };
      next.nfeProc.NFe.infNFe.pag.detPag = payments;
      return next;
    });
  };

  const addProduct = () => {
    setDoc(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const det = Array.isArray(next.nfeProc.NFe.infNFe.det) ? next.nfeProc.NFe.infNFe.det : next.nfeProc.NFe.infNFe.det ? [next.nfeProc.NFe.infNFe.det] : [];
      const nItem = det.length + 1;
      
      const newProduct = {
        nItem: nItem.toString(),
        prod: {
          cProd: "001",
          cEAN: "SEM GTIN",
          xProd: "PRODUTO TESTE",
          NCM: "00000000",
          CFOP: "5102",
          uCom: "UN",
          qCom: "1.0000",
          vUnCom: "0.0000000000",
          vProd: "0.00",
          cEANTrib: "SEM GTIN",
          uTrib: "UN",
          qTrib: "1.0000",
          vUnTrib: "0.0000000000",
          indTot: "1"
        },
        imposto: {
          ICMS: {
            ICMS00: {
              orig: "0",
              CST: "00",
              modBC: "3",
              vBC: "0.00",
              pICMS: "0.00",
              vICMS: "0.00"
            }
          },
          PIS: {
            PISAliq: {
              CST: "01",
              vBC: "0.00",
              pPIS: "0.00",
              vPIS: "0.00"
            }
          },
          COFINS: {
            COFINSAliq: {
              CST: "01",
              vBC: "0.00",
              pCOFINS: "0.00",
              vCOFINS: "0.00"
            }
          }
        }
      };
      
      next.nfeProc.NFe.infNFe.det = [...det, newProduct];
      return next;
    });
  };

  const removeProduct = (index: number) => {
    setDoc(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const det = Array.isArray(next.nfeProc.NFe.infNFe.det) ? next.nfeProc.NFe.infNFe.det : [next.nfeProc.NFe.infNFe.det];
      next.nfeProc.NFe.infNFe.det = det.filter((_: any, i: number) => i !== index).map((p: any, i: number) => ({ ...p, nItem: (i + 1).toString() }));
      return next;
    });
  };

  const downloadXml = () => {
    const blob = new Blob([xmlPreview], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFe_${doc.nfeProc.NFe.infNFe.ide.nNF || 'nova'}.xml`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const calculateTotals = () => {
    const result = calculateNfeTotals(doc.nfeProc.NFe.infNFe);
    if (result.ok === false) {
      setCalculationNotice({ kind: 'error', text: result.message });
      return;
    }

    const next = JSON.parse(JSON.stringify(doc)) as NFeDocument;
    const total = next.nfeProc.NFe.infNFe.total.ICMSTot;
    const { paymentValue, ...totals } = result.totals;
    Object.assign(total, totals);

    if (paymentValue !== undefined) {
      const payments = next.nfeProc.NFe.infNFe.pag.detPag;
      if (Array.isArray(payments) && payments.length === 1) payments[0].vPag = paymentValue;
      else if (payments && !Array.isArray(payments)) payments.vPag = paymentValue;
    }

    setDoc(next);
    setCalculationNotice({
      kind: 'success',
      text: 'Totais recalculados com precisão decimal. O cálculo é auxiliar: confira as regras do seu cenário e valide o XML em uma ferramenta fiscal.',
    });
  };

  const fixCommonFormatting = () => {
    setCalculationNotice(null);
    setDoc(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const inf = next.nfeProc.NFe.infNFe;

      // Remove accidental child tags
      if (inf.Id) delete inf.Id;
      if (inf.versao) delete inf.versao;
      
      // Fix CNPJs
      if (inf.emit.CNPJ) inf.emit.CNPJ = padVal(inf.emit.CNPJ, 14);
      if (inf.dest.CNPJ) inf.dest.CNPJ = padVal(inf.dest.CNPJ, 14);
      if (inf.transp.transporta?.CNPJ) inf.transp.transporta.CNPJ = padVal(inf.transp.transporta.CNPJ, 14);
      
      // Fix CPFs
      if (inf.emit.CPF) inf.emit.CPF = padVal(inf.emit.CPF, 11);
      if (inf.dest.CPF) inf.dest.CPF = padVal(inf.dest.CPF, 11);
      
      // Clean IEs (Numbers only)
      if (inf.emit.IE) inf.emit.IE = cleanIE(inf.emit.IE);
      if (inf.dest.IE) inf.dest.IE = cleanIE(inf.dest.IE);
      if (inf.transp.transporta?.IE) inf.transp.transporta.IE = cleanIE(inf.transp.transporta.IE);
      
      // Fix Products (CEST, NCM)
      const det = Array.isArray(inf.det) ? inf.det : [inf.det].filter(Boolean);
      det.forEach((item: any) => {
        if (item.prod.CEST) item.prod.CEST = padVal(item.prod.CEST, 7);
        if (item.prod.NCM) item.prod.NCM = padVal(item.prod.NCM, 8);
        
        // Fix ICMS CSTs (always 2 digits for most, 3 for CSOSN)
        const icms = item.imposto?.ICMS;
        if (icms) {
          const type = Object.keys(icms)[0];
          if (type && icms[type]?.CST) {
            icms[type].CST = String(icms[type].CST).padStart(2, '0');
          }
          if (type && icms[type]?.CSOSN) {
            icms[type].CSOSN = String(icms[type].CSOSN).padStart(3, '0');
          }
        }
      });
      
      return next;
    });
  };

  const tabs = [
    { id: 'sobre', label: 'Sobre o App', icon: Info },
    { id: 'ide', label: 'Identificação', icon: FileText },
    { id: 'emit', label: 'Emitente', icon: Building },
    { id: 'dest', label: 'Destinatário', icon: User },
    { id: 'det', label: 'Produtos', icon: Package },
    { id: 'total', label: 'Totais', icon: Info },
    { id: 'transp', label: 'Transporte', icon: Truck },
    { id: 'pag', label: 'Pagamento', icon: CreditCard },
    { id: 'cobr', label: 'Cobrança', icon: Landmark },
    { id: 'infAdic', label: 'Observações', icon: MessageSquare },
    { id: 'fiscal', label: 'Integridade', icon: AlertCircle },
  ];
  const paymentDetails = Array.isArray(doc.nfeProc.NFe.infNFe.pag.detPag)
    ? doc.nfeProc.NFe.infNFe.pag.detPag
    : doc.nfeProc.NFe.infNFe.pag.detPag ? [doc.nfeProc.NFe.infNFe.pag.detPag] : [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans" id="nfe-app">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 py-3 sm:px-6 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <FileText size={24} />
          </div>
          <h1 className="text-base sm:text-xl font-bold text-gray-900 tracking-tight">Editor de XML de NF-e</h1>
        </div>
        
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button
            onClick={toggleDarkMode}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors border border-gray-200"
            title="Alternar Tema"
            aria-label="Alternar tema"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button 
            onClick={() => {
              // Basic template based on common structure
              setDoc(BLANK_NFE);
              setActiveTab('ide');
              setUploadNotice(null);
              setCalculationNotice(null);
            }}
            className="hidden md:flex items-center gap-2 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all border border-indigo-100"
          >
            Resetar
          </button>

          <button 
            onClick={() => setViewTab(v => v === 'form' ? 'xml' : 'form')}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label={viewXml === 'form' ? 'Ver XML' : 'Ver formulário'}
          >
            {viewXml === 'form' ? 'Ver XML' : 'Ver Formulário'}
          </button>
          
          <label className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer transition-all shadow-sm hover:shadow-md">
            <FileUp size={18} />
            <span>Upload XML</span>
            <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} />
          </label>
          
          <button 
            onClick={downloadXml}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all shadow-sm hover:shadow-md"
            aria-label="Baixar XML"
          >
            <Download size={18} />
            <span>Baixar XML</span>
          </button>
        </div>
      </header>

      <nav className="lg:hidden hide-scrollbar bg-white border-b border-gray-200 px-3 py-2 overflow-x-auto" aria-label="Seções da nota">
        <div className="flex w-max min-w-full gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              id={`mobile-tab-${tab.id}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => { setActiveTab(tab.id); setViewTab('form'); }}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                activeTab === tab.id
                  ? 'border-indigo-100 bg-indigo-50 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <tab.icon size={16} className={activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'} />
              <span>{tab.label}</span>
              {errors.some(error => error.section === tab.id) && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Aviso nesta seção" />}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Nav */}
        <nav className="w-64 bg-white border-r border-gray-200 overflow-y-auto hidden lg:block" aria-label="Seções da nota">
          <div className="p-4 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 px-2">Seções da Nota</p>
            {tabs.map(tab => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                onClick={() => { setActiveTab(tab.id); setViewTab('form'); }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all",
                  activeTab === tab.id 
                    ? "bg-indigo-50 text-indigo-700 border-indigo-100" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <tab.icon size={18} className={activeTab === tab.id ? "text-indigo-600" : "text-gray-400"} />
                <span>{tab.label}</span>
                {errors.some(e => e.section === tab.id) && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-red-500 shadow-sm" />
                )}
              </button>
            ))}
          </div>
          
          <div className="p-6 mt-4 opacity-50 bg-gray-50 m-4 rounded-xl border border-dashed border-gray-200">
             <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Info size={16} />
                <span className="text-xs font-bold uppercase tracking-tighter">Versão 4.00</span>
             </div>
             <p className="text-[10px] text-gray-400 leading-tight">Editor local para o leiaute NF-e 4.00; não substitui validação XSD.</p>
          </div>
        </nav>

        {/* content area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
          {(uploadNotice || calculationNotice) && (
            <div className="max-w-4xl mx-auto space-y-3 mb-6" aria-live="polite">
              {[uploadNotice, calculationNotice].filter(Boolean).map((notice, index) => (
                <div
                  key={`${notice?.kind}-${index}`}
                  role={notice?.kind === 'error' ? 'alert' : 'status'}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm font-medium',
                    notice?.kind === 'error'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  )}
                >
                  {notice?.text}
                </div>
              ))}
            </div>
          )}
          <AnimatePresence mode="wait">
            {viewXml === 'xml' ? (
              <motion.div 
                key="xml-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"
              >
                <div className="bg-gray-50 border-b border-gray-100 px-6 py-3 flex items-center justify-between">
                   <div className="flex items-center gap-2 text-gray-500">
                      <FileText size={16} />
                      <span className="text-xs font-mono">ESTRUTURA XML</span>
                   </div>
                   <button 
                     onClick={() => navigator.clipboard.writeText(xmlPreview)}
                     className="text-[10px] font-bold bg-white px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                   >
                     COPIAR
                   </button>
                </div>
                <pre className="flex-1 p-6 font-mono text-sm overflow-auto text-gray-700 leading-relaxed scrollbar-thin scrollbar-thumb-gray-200">
                  {xmlPreview}
                </pre>
              </motion.div>
            ) : (
              <motion.div 
                key="form-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto space-y-8 pb-20"
              >
                {/* Section Title */}
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 sm:gap-4">
                   <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                     {tabs.find(t => t.id === activeTab)?.label}
                   </h2>
                   <p className="text-gray-400 text-sm italic">Preencha os campos abaixo de acordo com o padrão SEFAZ</p>
                </div>

                {/* Form Sections */}
                {activeTab === 'sobre' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                    <div className="bg-indigo-600 rounded-3xl p-8 md:p-12 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
                      <div className="relative z-10">
                        <h3 className="text-4xl font-black mb-4">Sobre o XML NFe Editor</h3>
                        <p className="text-lg text-indigo-100 max-w-2xl leading-relaxed">
                          Sua ferramenta técnica para ajuste e limpeza de dados em arquivos XML de NF-e para fins de importação em ERPs.
                        </p>
                      </div>
                      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center">
                          <CheckCircle2 size={24} />
                        </div>
                        <h4 className="text-xl font-bold text-gray-900">O que é e para que serve?</h4>
                        <p className="text-gray-500 text-sm leading-relaxed">
                          Este aplicativo é um editor local de XML de Nota Fiscal Eletrônica (NF-e). Ele ajuda a revisar campos, ajustar a formatação de identificadores e preparar um arquivo para análise ou importação em um sistema de gestão.
                        </p>
                      </div>

                      <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
                          <AlertCircle size={24} />
                        </div>
                        <h4 className="text-xl font-bold text-gray-900">Sem Valor Fiscal</h4>
                        <p className="text-gray-500 text-sm leading-relaxed text-red-600 font-medium">
                          <strong>IMPORTANTE:</strong> Após qualquer edição manual, o XML perde sua assinatura digital original e, consequentemente, seu <strong>VALOR JURÍDICO/FISCAL</strong>. O arquivo editado deve ser utilizado estritamente para preenchimento de dados no seu sistema interno. Para validade fiscal, peça sempre uma nota corrigida (ou carta de correção) ao emissor.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                       <h4 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                          <Wand2 size={22} className="text-indigo-600" />
                          Funcionalidades e Bloqueios
                       </h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                             <h5 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                <Cpu size={16} className="text-indigo-400" />
                                Limpeza Automática
                             </h5>
                             <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                O botão de correção remove pontuação de campos selecionados, como CNPJ e Inscrição Estadual. Revise os dados antes de exportar.
                             </p>
                          </div>
                          <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                             <h5 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                <FileText size={16} className="text-indigo-400" />
                                Reordenação de Tags
                             </h5>
                             <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                Ao baixar o XML, o editor organiza os principais grupos de tags. A estrutura não passa por validação XSD completa; confira o arquivo em uma ferramenta fiscal antes de importar.
                             </p>
                          </div>
                       </div>
                    </div>

                    <div className="bg-indigo-50 p-8 rounded-3xl border border-indigo-100 text-center">
                       <h4 className="text-lg font-bold text-indigo-900 mb-2">Como Começar?</h4>
                       <p className="text-sm text-indigo-700 max-w-xl mx-auto mb-6">
                          Carregue seu XML problemático usando o botão no topo da página. Navegue pelas abas laterais para visualizar e ajustar os dados necessários.
                       </p>
                       <div className="flex flex-wrap justify-center gap-3">
                          <div className="px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-black uppercase tracking-wider">Passo 1: Upload</div>
                          <ChevronRight size={16} className="text-indigo-300 mt-1" />
                          <div className="px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-black uppercase tracking-wider">Passo 2: Edição</div>
                          <ChevronRight size={16} className="text-indigo-300 mt-1" />
                          <div className="px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-black uppercase tracking-wider">Passo 3: Download</div>
                       </div>
                    </div>
                  </div>
                )}

                {activeTab === 'ide' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500" id="section-ide">
                     <FormField label="Número NF" value={doc.nfeProc.NFe.infNFe.ide.nNF} onChange={v => updateField('ide.nNF', v)} />
                     <FormField label="Série" value={doc.nfeProc.NFe.infNFe.ide.serie} onChange={v => updateField('ide.serie', v)} />
                     <FormField label="Nat. Operação" value={doc.nfeProc.NFe.infNFe.ide.natOp} onChange={v => updateField('ide.natOp', v)} className="md:col-span-1" />
                     <FormField label="Data Emissão" value={doc.nfeProc.NFe.infNFe.ide.dhEmi} onChange={v => updateField('ide.dhEmi', v)} type="datetime-local" />
                     <FormField label="Código Num." value={doc.nfeProc.NFe.infNFe.ide.cNF} onChange={v => updateField('ide.cNF', v)} />
                     <FormField label="UF Código" value={doc.nfeProc.NFe.infNFe.ide.cUF} onChange={v => updateField('ide.cUF', v)} />
                     <FormField label="Tipo NF" value={doc.nfeProc.NFe.infNFe.ide.tpNF} onChange={v => updateField('ide.tpNF', v)} select={[ {v: '0', l: 'Entrada'}, {v: '1', l: 'Saída'} ]} />
                     <FormField label="Finalidade" value={doc.nfeProc.NFe.infNFe.ide.finNFe} onChange={v => updateField('ide.finNFe', v)} select={[ {v: '1', l: 'Normal'}, {v: '2', l: 'Complementar'}, {v: '3', l: 'Ajuste'}, {v: '4', l: 'Devolução'} ]} />
                     <FormField label="Ambiente" value={doc.nfeProc.NFe.infNFe.ide.tpAmb} onChange={v => updateField('ide.tpAmb', v)} select={[ {v: '1', l: 'Produção'}, {v: '2', l: 'Homologação'} ]} />
                     <FormField label="Processo Emiss." value={doc.nfeProc.NFe.infNFe.ide.procEmi} onChange={v => updateField('ide.procEmi', v)} select={[ {v: '0', l: '0 - Aplicativo do Contribuinte'}, {v: '3', l: '3 - Aplicativo do SEFAZ'} ]} />
                     <FormField label="Versão Processo" value={doc.nfeProc.NFe.infNFe.ide.verProc} onChange={v => updateField('ide.verProc', v)} />
                     <FormField label="Tipo Impressão" value={doc.nfeProc.NFe.infNFe.ide.tpImp} onChange={v => updateField('ide.tpImp', v)} select={[ {v: '1', l: 'Retrato'}, {v: '2', l: 'Paisagem'} ]} />
                     <FormField label="Destino Operação" value={doc.nfeProc.NFe.infNFe.ide.idDest} onChange={v => updateField('ide.idDest', v)} select={[ {v: '1', l: 'Interna'}, {v: '2', l: 'Interestadual'}, {v: '3', l: 'Exterior'} ]} />
                  </div>
                )}

                {activeTab === 'emit' && (
                  <div className="space-y-6" id="section-emit">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="CNPJ/CPF" value={doc.nfeProc.NFe.infNFe.emit.CNPJ || doc.nfeProc.NFe.infNFe.emit.CPF} numericOnly onChange={v => {
                        const isCnpj = v.replace(/\D/g, '').length > 11;
                        setDoc(prev => {
                          const next = JSON.parse(JSON.stringify(prev));
                          delete next.nfeProc.NFe.infNFe.emit.CNPJ;
                          delete next.nfeProc.NFe.infNFe.emit.CPF;
                          if (isCnpj) next.nfeProc.NFe.infNFe.emit.CNPJ = v;
                          else next.nfeProc.NFe.infNFe.emit.CPF = v;
                          return next;
                        });
                      }} />
                      <FormField label="Razão Social" value={doc.nfeProc.NFe.infNFe.emit.xNome} onChange={v => updateField('emit.xNome', v)} />
                      <FormField label="Inscrição Estadual" value={doc.nfeProc.NFe.infNFe.emit.IE} numericOnly onChange={v => updateField('emit.IE', v)} />
                      <FormField label="CRT" value={doc.nfeProc.NFe.infNFe.emit.CRT} onChange={v => updateField('emit.CRT', v)} select={[{v: '1', l: 'Simples Nacional'}, {v: '3', l: 'Regime Normal'}]} />
                    </div>
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                       <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                          Endereço do Emitente
                       </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <FormField label="Logradouro" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.xLgr} onChange={v => updateField('emit.enderEmit.xLgr', v)} className="md:col-span-2" />
                          <FormField label="Número" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.nro} onChange={v => updateField('emit.enderEmit.nro', v)} />
                          <FormField label="Complemento" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.xCpl} onChange={v => updateField('emit.enderEmit.xCpl', v)} />
                          <FormField label="Bairro" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.xBairro} onChange={v => updateField('emit.enderEmit.xBairro', v)} />
                          <FormField label="CEP" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.CEP} onChange={v => updateField('emit.enderEmit.CEP', v)} />
                          <FormField label="Cidade" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.xMun} onChange={v => updateField('emit.enderEmit.xMun', v)} />
                          <FormField label="Cód. Município" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.cMun} onChange={v => updateField('emit.enderEmit.cMun', v)} />
                          <FormField label="UF" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.UF} onChange={v => updateField('emit.enderEmit.UF', v)} />
                          <FormField label="Telefone" value={doc.nfeProc.NFe.infNFe.emit.enderEmit.fone} onChange={v => updateField('emit.enderEmit.fone', v)} />
                        </div>
                    </div>
                  </div>
                )}

                {activeTab === 'dest' && (
                  <div className="space-y-6 animate-in fade-in duration-500" id="section-dest">
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800">
                      <AlertCircle className="shrink-0 mt-0.5" size={18} />
                      <div className="text-sm">
                        <p className="font-bold">Atenção para Importação:</p>
                        <p className="opacity-90 leading-tight mt-1">
                          Para que o XML seja validado corretamente pelo seu sistema ao importar, certifique-se de que os dados do <strong>Destinatário (sua empresa/cliente)</strong> estejam preenchidos de forma idêntica ao cadastro no sistema receptor. Qualquer divergência de CNPJ, IE ou Razão Social pode causar erros no processamento.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="CNPJ/CPF" value={doc.nfeProc.NFe.infNFe.dest.CNPJ || doc.nfeProc.NFe.infNFe.dest.CPF} numericOnly onChange={v => {
                        const isCnpj = v.replace(/\D/g, '').length > 11;
                        setDoc(prev => {
                          const next = JSON.parse(JSON.stringify(prev));
                          delete next.nfeProc.NFe.infNFe.dest.CNPJ;
                          delete next.nfeProc.NFe.infNFe.dest.CPF;
                          if (isCnpj) next.nfeProc.NFe.infNFe.dest.CNPJ = v;
                          else next.nfeProc.NFe.infNFe.dest.CPF = v;
                          return next;
                        });
                      }} />
                      <FormField label="Nome / Razão Social" value={doc.nfeProc.NFe.infNFe.dest.xNome} onChange={v => updateField('dest.xNome', v)} />
                      <FormField label="Inscrição Estadual" value={doc.nfeProc.NFe.infNFe.dest.IE} numericOnly onChange={v => updateField('dest.IE', v)} />
                      <FormField label="Indicador IE" value={doc.nfeProc.NFe.infNFe.dest.indIEDest} onChange={v => updateField('dest.indIEDest', v)} select={[{v: '1', l: 'Contribuinte ICMS'}, {v: '2', l: 'Contrib. Isento'}, {v: '9', l: 'Não Contribuinte'}]} />
                    </div>
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                       <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                          Endereço do Destinatário
                       </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <FormField label="Logradouro" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.xLgr} onChange={v => updateField('dest.enderDest.xLgr', v)} className="md:col-span-2" />
                          <FormField label="Número" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.nro} onChange={v => updateField('dest.enderDest.nro', v)} />
                          <FormField label="Complemento" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.xCpl} onChange={v => updateField('dest.enderDest.xCpl', v)} />
                          <FormField label="Bairro" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.xBairro} onChange={v => updateField('dest.enderDest.xBairro', v)} />
                          <FormField label="CEP" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.CEP} onChange={v => updateField('dest.enderDest.CEP', v)} />
                          <FormField label="Cidade" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.xMun} onChange={v => updateField('dest.enderDest.xMun', v)} />
                          <FormField label="Cód. Município" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.cMun} onChange={v => updateField('dest.enderDest.cMun', v)} />
                          <FormField label="UF" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.UF} onChange={v => updateField('dest.enderDest.UF', v)} />
                          <FormField label="Telefone" value={doc.nfeProc.NFe.infNFe.dest.enderDest?.fone} onChange={v => updateField('dest.enderDest.fone', v)} />
                        </div>
                    </div>
                  </div>
                )}

                {activeTab === 'det' && (
                  <div className="space-y-6" id="section-det">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-gray-800 tracking-tight">Itens da Nota</h3>
                      <button 
                        onClick={addProduct}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md hover:scale-105 transition-all"
                      >
                        <Plus size={18} />
                        Adicionar Produto
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {Array.from(Array.isArray(doc.nfeProc.NFe.infNFe.det) ? doc.nfeProc.NFe.infNFe.det : doc.nfeProc.NFe.infNFe.det ? [doc.nfeProc.NFe.infNFe.det] : []).map((item: any, idx: number) => (
                        <ProductItem 
                          key={idx} 
                          item={item} 
                          index={idx} 
                          onRemove={() => removeProduct(idx)}
                          onChange={(field, value) => {
                             setCalculationNotice(null);
                             setDoc(prev => {
                               const current = prev.nfeProc.NFe.infNFe.det;
                               const det = (Array.isArray(current) ? current : [current]).map(item => JSON.parse(JSON.stringify(item)));
                               if (!det[idx]) return prev;
                               const parts = field.split('.');
                               let curr = det[idx];
                               for (let i = 0; i < parts.length - 1; i++) {
                                 if (!curr[parts[i]]) curr[parts[i]] = {};
                                 curr = curr[parts[i]];
                               }
                               curr[parts[parts.length - 1]] = value;
                               return { ...prev, nfeProc: { ...prev.nfeProc, NFe: { ...prev.nfeProc.NFe, infNFe: { ...prev.nfeProc.NFe.infNFe, det } } } };
                             });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'total' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-gray-800">Totais da Nota</h3>
                      <button 
                        onClick={calculateTotals}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md transition-all"
                      >
                        <Save size={18} />
                        Recalcular Totais Automático
                      </button>
                    </div>
                    
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-8" id="section-total">
                       <FormField label="Valor Total Produtos" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vProd} onChange={(v:any) => updateField('total.ICMSTot.vProd', v)} />
                       <FormField label="Base de Cálculo ICMS" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vBC} onChange={(v:any) => updateField('total.ICMSTot.vBC', v)} />
                       <FormField label="Valor ICMS" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vICMS} onChange={(v:any) => updateField('total.ICMSTot.vICMS', v)} />
                       <FormField label="Valor IPI" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vIPI} onChange={(v:any) => updateField('total.ICMSTot.vIPI', v)} />
                       <FormField label="Valor PIS" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vPIS} onChange={(v:any) => updateField('total.ICMSTot.vPIS', v)} />
                       <FormField label="Valor COFINS" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vCOFINS} onChange={(v:any) => updateField('total.ICMSTot.vCOFINS', v)} />
                       <FormField label="Valor Frete" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vFrete} onChange={(v:any) => updateField('total.ICMSTot.vFrete', v)} />
                       <FormField label="Valor Seguro" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vSeg} onChange={(v:any) => updateField('total.ICMSTot.vSeg', v)} />
                       <FormField label="Descontos" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vDesc} onChange={(v:any) => updateField('total.ICMSTot.vDesc', v)} />
                       <FormField label="Outras Despesas" value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vOutro} onChange={(v:any) => updateField('total.ICMSTot.vOutro', v)} />
                       
                       <div className="md:col-span-3 border-t border-gray-100 pt-8 mt-4">
                          <FormField 
                            label="VALOR TOTAL DA NOTA (vNF)" 
                            value={doc.nfeProc.NFe.infNFe.total.ICMSTot.vNF} 
                            onChange={(v:any) => updateField('total.ICMSTot.vNF', v)} 
                            className="max-w-md mx-auto"
                            inputClassName="text-xl font-black text-indigo-700 bg-indigo-50 border-indigo-200"
                          />
                       </div>
                    </div>
                  </div>
                )}
                
                {activeTab === 'transp' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" id="section-transp">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-8 rounded-2xl border border-gray-200">
                        <FormField 
                          label="Modalidade Frete" 
                          value={doc.nfeProc.NFe.infNFe.transp.modFrete} 
                          onChange={(v:any) => updateField('transp.modFrete', v)} 
                          select={[
                            {v: '0', l: '0 - Contratação por conta do Remetente (CIF)'},
                            {v: '1', l: '1 - Contratação por conta do Destinatário (FOB)'},
                            {v: '2', l: '2 - Contratação por conta de Terceiros'},
                            {v: '3', l: '3 - Próprio por conta do Remetente'},
                            {v: '4', l: '4 - Próprio por conta do Destinatário'},
                            {v: '9', l: '9 - Sem Ocorrência de Transporte'}
                          ]}
                          className="md:col-span-3"
                        />
                     </div>
                     
                     <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                           <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                           Dados do Transportador
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <FormField label="CNPJ/CPF" value={doc.nfeProc.NFe.infNFe.transp.transporta?.CNPJ || doc.nfeProc.NFe.infNFe.transp.transporta?.CPF} numericOnly onChange={(v:any) => {
                             const isCnpj = v.replace(/\D/g, '').length > 11;
                             setDoc(prev => {
                               const next = JSON.parse(JSON.stringify(prev));
                               if (!next.nfeProc.NFe.infNFe.transp.transporta) next.nfeProc.NFe.infNFe.transp.transporta = {};
                               delete next.nfeProc.NFe.infNFe.transp.transporta.CNPJ;
                               delete next.nfeProc.NFe.infNFe.transp.transporta.CPF;
                               if (isCnpj) next.nfeProc.NFe.infNFe.transp.transporta.CNPJ = v;
                               else next.nfeProc.NFe.infNFe.transp.transporta.CPF = v;
                               return next;
                             });
                           }} />
                           <FormField label="Nome" value={doc.nfeProc.NFe.infNFe.transp.transporta?.xNome} onChange={(v:any) => updateField('transp.transporta.xNome', v)} />
                           <FormField label="IE" value={doc.nfeProc.NFe.infNFe.transp.transporta?.IE} numericOnly onChange={(v:any) => updateField('transp.transporta.IE', v)} />
                           <FormField label="Endereço" value={doc.nfeProc.NFe.infNFe.transp.transporta?.xEnder} onChange={(v:any) => updateField('transp.transporta.xEnder', v)} />
                        </div>
                     </div>

                     <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                           <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                           Volumes
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                           <FormField label="Qtd. Volumes" value={doc.nfeProc.NFe.infNFe.transp.vol?.qVol} onChange={(v:any) => updateField('transp.vol.qVol', v)} />
                           <FormField label="Espécie" value={doc.nfeProc.NFe.infNFe.transp.vol?.esp} onChange={(v:any) => updateField('transp.vol.esp', v)} />
                           <FormField label="Peso Líquido" value={doc.nfeProc.NFe.infNFe.transp.vol?.pesoL} onChange={(v:any) => updateField('transp.vol.pesoL', v)} />
                           <FormField label="Peso Bruto" value={doc.nfeProc.NFe.infNFe.transp.vol?.pesoB} onChange={(v:any) => updateField('transp.vol.pesoB', v)} />
                        </div>
                     </div>
                  </div>
                )}

                {activeTab === 'pag' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" id="section-pag">
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 space-y-6 shadow-sm">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">Informações de Pagamento</h3>
                      {paymentDetails.map((payment: any, index: number) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-6 rounded-xl border border-gray-100 bg-gray-50 p-5">
                          <FormField
                            label={`Forma de Pagamento ${index + 1}`}
                            value={payment.tPag}
                            onChange={(value: string) => updatePaymentField(index, 'tPag', value)}
                            select={[
                              ...(payment.tPag && !PAYMENT_METHODS.some(option => option.v === String(payment.tPag))
                                ? [{ v: String(payment.tPag), l: `Código ${payment.tPag} (original)` }]
                                : []),
                              ...PAYMENT_METHODS,
                            ]}
                          />
                          <FormField
                            label={`Valor Pagamento ${index + 1}`}
                            value={payment.vPag}
                            onChange={(value: string) => updatePaymentField(index, 'vPag', value)}
                            inputClassName="font-bold text-gray-900"
                          />
                        </div>
                      ))}
                      {paymentDetails.length === 0 && (
                        <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                          Este arquivo não informa detalhes de pagamento.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'cobr' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" id="section-cobr">
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">Informações da Fatura</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <FormField label="Número Fatura" value={doc.nfeProc.NFe.infNFe.cobr?.fat?.nFat} onChange={(v:any) => updateField('cobr.fat.nFat', v)} />
                        <FormField label="Valor Original" value={doc.nfeProc.NFe.infNFe.cobr?.fat?.vOrig} onChange={(v:any) => updateField('cobr.fat.vOrig', v)} />
                        <FormField label="Valor Desconto" value={doc.nfeProc.NFe.infNFe.cobr?.fat?.vDesc} onChange={(v:any) => updateField('cobr.fat.vDesc', v)} />
                        <FormField label="Valor Líquido" value={doc.nfeProc.NFe.infNFe.cobr?.fat?.vLiq} onChange={(v:any) => updateField('cobr.fat.vLiq', v)} />
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                       <div className="flex items-center justify-between">
                          <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">Duplicatas</h3>
                       </div>
                       
                       <div className="space-y-4">
                          {(Array.isArray(doc.nfeProc.NFe.infNFe.cobr?.dup) ? doc.nfeProc.NFe.infNFe.cobr.dup : doc.nfeProc.NFe.infNFe.cobr?.dup ? [doc.nfeProc.NFe.infNFe.cobr.dup] : []).map((dup: any, idx: number) => (
                             <div key={idx} className="p-6 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6 relative group">
                                <FormField label="Número Duplicata" value={dup.nDup} onChange={(v:any) => {
                                   const duplicatas = Array.isArray(doc.nfeProc.NFe.infNFe.cobr.dup) ? [...doc.nfeProc.NFe.infNFe.cobr.dup] : [doc.nfeProc.NFe.infNFe.cobr.dup];
                                   duplicatas[idx].nDup = v;
                                   updateField('cobr.dup', duplicatas);
                                }} />
                                <FormField label="Vencimento" value={dup.dVenc} onChange={(v:any) => {
                                   const duplicatas = Array.isArray(doc.nfeProc.NFe.infNFe.cobr.dup) ? [...doc.nfeProc.NFe.infNFe.cobr.dup] : [doc.nfeProc.NFe.infNFe.cobr.dup];
                                   duplicatas[idx].dVenc = v;
                                   updateField('cobr.dup', duplicatas);
                                }} type="date" />
                                <FormField label="Valor" value={dup.vDup} onChange={(v:any) => {
                                   const duplicatas = Array.isArray(doc.nfeProc.NFe.infNFe.cobr.dup) ? [...doc.nfeProc.NFe.infNFe.cobr.dup] : [doc.nfeProc.NFe.infNFe.cobr.dup];
                                   duplicatas[idx].vDup = v;
                                   updateField('cobr.dup', duplicatas);
                                }} />
                             </div>
                          ))}
                       </div>
                    </div>
                  </div>
                )}

                {activeTab === 'infAdic' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" id="section-infadic">
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">Informações Adicionais</h3>
                      <div className="space-y-6">
                        <div className="space-y-1.5">
                          <label htmlFor="infCpl" className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">Informações Complementares (infCpl)</label>
                          <textarea 
                            id="infCpl"
                            value={doc.nfeProc.NFe.infNFe.infAdic?.infCpl || ''} 
                            onChange={e => updateField('infAdic.infCpl', e.target.value)}
                            rows={6}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none resize-none"
                            placeholder="Ex: Fatura paga, observações de impostos, etc..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="infAdFisco" className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">Informações do Fisco (infAdFisco)</label>
                          <textarea 
                            id="infAdFisco"
                            value={doc.nfeProc.NFe.infNFe.infAdic?.infAdFisco || ''} 
                            onChange={e => updateField('infAdic.infAdFisco', e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none resize-none font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'fiscal' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-8">
                       <div className="flex items-center justify-between">
                         <div>
                            <h3 className="text-xl font-bold text-gray-900">Diagnóstico de Integridade Fiscal</h3>
                            <p className="text-sm text-gray-500 mt-1">Verificações locais de campos e formatação; não substituem a validação XSD ou a autorização da SEFAZ.</p>
                         </div>
                         <button 
                           onClick={fixCommonFormatting}
                           className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 group"
                         >
                           <Wand2 size={20} className="group-hover:rotate-12 transition-transform" />
                           Corrigir Formatação Automática
                         </button>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Diagnostic Cards */}
                          <div className={`p-6 rounded-2xl border ${doc.nfeProc.protNFe ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                             <div className="flex gap-4">
                                <div className={`p-3 rounded-xl ${doc.nfeProc.protNFe ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                   <Lock size={24} />
                                </div>
                                <div>
                                   <h4 className="font-bold text-gray-900">Status de Autorização</h4>
                                   <p className="text-sm mt-1 text-gray-600">
                                      {doc.nfeProc.protNFe 
                                        ? "XML já possui protocolo de autorização. Qualquer alteração em dados sensíveis (CNPJ, Valores, Itens) invalidará o documento perante a SEFAZ." 
                                        : "XML sem protocolo. Edição livre para pré-validação."}
                                   </p>
                                </div>
                             </div>
                          </div>

                          <div className={`p-6 rounded-2xl border ${(doc.nfeProc.NFe.infNFe.ide.cNF || '').includes('e') ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                             <div className="flex gap-4">
                                <div className={`p-3 rounded-xl ${(doc.nfeProc.NFe.infNFe.ide.cNF || '').includes('e') ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                   <Cpu size={24} />
                                </div>
                                <div>
                                   <h4 className="font-bold text-gray-900">Campos Numéricos (Notação Científica)</h4>
                                   <p className="text-sm mt-1 text-gray-600">
                                      {(doc.nfeProc.NFe.infNFe.ide.cNF || '').includes('e') 
                                        ? "ERRO CRÍTICO: Chave ou códigos corrompidos por notação científica (ex: 4.22e+43). Clique em Corrigir ou ajuste manualmente." 
                                        : "Chave e códigos estão em formato string correto."}
                                   </p>
                                </div>
                             </div>
                          </div>
                       </div>

                       <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                          <h4 className="font-black text-indigo-900 uppercase text-xs tracking-widest mb-4">Relatório de Diagnóstico Local</h4>
                          <ul className="space-y-3">
                             <li className="flex items-start gap-2 text-sm text-indigo-800">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                                <span><strong>Versão:</strong> {doc.nfeProc["@_versao"] === "4.00" ? "Correta (4.00)" : "Incorreta (Ajustado para 4.00)"}</span>
                             </li>
                             <li className="flex items-start gap-2 text-sm text-indigo-800">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                                <span><strong>Declaração XML:</strong> Forçada como UTF-8 1.0 (Padrão SEFAZ)</span>
                             </li>
                             {doc.nfeProc.NFe.infNFe.infAdic?.infCpl?.includes(doc.nfeProc.NFe.infNFe.dest.xNome) ? null : (
                               <li className="flex items-start gap-2 text-sm text-amber-800">
                                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                  <span><strong>Inconsistência:</strong> O nome do destinatário ({doc.nfeProc.NFe.infNFe.dest.xNome}) é diferente do citado nas Informações Complementares. Isso é comum em XMLs editados manualmente.</span>
                               </li>
                             )}
                          </ul>
                       </div>

                       <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                          <h4 className="font-black text-amber-900 uppercase text-xs tracking-widest mb-4">Aviso de Uso Técnico</h4>
                          <p className="text-sm text-amber-800 leading-relaxed font-medium">
                             Este XML editado é destinado apenas para facilitar a <strong>importação de dados</strong> em sistemas como Bling. Saiba que alterações em campos como Destinatário ou CNPJ invalidam a assinatura digital original. Para que a nota tenha validade jurídica total, o ideal é que o emissor cancele e reemita o documento com os dados corretos.
                          </p>
                       </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", select, className, inputClassName, numericOnly }: any) {
  const controlId = useId();
  const handleChange = (val: string) => {
    if (numericOnly) {
      onChange(val.replace(/\D/g, ''));
    } else {
      onChange(val);
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={controlId} className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">{label}</label>
      {select ? (
        <select 
          id={controlId}
          value={value} 
          onChange={e => handleChange(e.target.value)}
          className={cn(
            "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none",
            inputClassName
          )}
        >
          {select.map((opt: any) => <option key={opt.v} value={opt.v}>{opt.l}</option>)}
        </select>
      ) : (
        <input 
          id={controlId}
          type={type} 
          value={value || ''} 
          onChange={e => handleChange(e.target.value)}
          className={cn(
            "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none",
            inputClassName
          )}
        />
      )}
    </div>
  );
}

function ProductItem({ item, index, onRemove, onChange }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const variantAllowsEdit = (group: any, editableVariant: string) => {
    const variants = Object.keys(group ?? {});
    return variants.length === 0 || (variants.length === 1 && variants[0] === editableVariant);
  };
  const canEditIpi = variantAllowsEdit(item.imposto?.IPI, 'IPITrib');
  const canEditIcms = variantAllowsEdit(item.imposto?.ICMS, 'ICMS00');
  const canEditPis = variantAllowsEdit(item.imposto?.PIS, 'PISAliq');
  const canEditCofins = variantAllowsEdit(item.imposto?.COFINS, 'COFINSAliq');
  
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden group">
      <div className={cn(
        "px-4 sm:px-6 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors",
        isOpen && "bg-gray-50/50 border-b border-gray-100"
      )}>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className="min-w-0 flex-1 flex items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
        >
          <div className="min-w-0 flex items-center gap-3 sm:gap-4">
            <div className="w-8 h-8 shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
               {index + 1}
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-gray-800 text-sm truncate">{item.prod.xProd || "Produto sem nome"}</h4>
              <div className="flex flex-wrap items-center gap-x-3 text-[10px] uppercase font-bold tracking-tighter text-gray-400 mt-0.5">
                 <span>Cód: {item.prod.cProd}</span>
                 <span className="bg-gray-200 w-1 h-1 rounded-full" />
                 <span>Quantidade: {item.prod.qCom} {item.prod.uCom}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-900">R$ {item.prod.vProd}</p>
              <p className="text-[10px] text-gray-400">CFOP {item.prod.CFOP}</p>
            </div>
            <div className={cn("p-1 text-gray-400 transition-transform duration-300", isOpen && "rotate-180")}>
              <ChevronDown size={20} />
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${item.prod.xProd || `produto ${index + 1}`}`}
          title="Remover produto"
          className="shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-8 space-y-8 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <FormField label="Código Item" value={item.prod.cProd} onChange={(v:any) => onChange('prod.cProd', v)} />
                <FormField label="Descrição" value={item.prod.xProd} onChange={(v:any) => onChange('prod.xProd', v)} className="md:col-span-2" />
                <FormField label="NCM" value={item.prod.NCM} onChange={(v:any) => onChange('prod.NCM', v)} />
                <FormField label="CFOP" value={item.prod.CFOP} onChange={(v:any) => onChange('prod.CFOP', v)} />
                <FormField label="Unidade" value={item.prod.uCom} onChange={(v:any) => onChange('prod.uCom', v)} />
                <FormField label="Quantidade" value={item.prod.qCom} onChange={(v:any) => onChange('prod.qCom', v)} />
                <FormField label="Subtotal (vProd)" value={item.prod.vProd} onChange={(v:any) => onChange('prod.vProd', v)} />
                <FormField label="Desconto" value={item.prod.vDesc} onChange={(v:any) => onChange('prod.vDesc', v)} />
                <FormField label="Outras Despesas" value={item.prod.vOutro} onChange={(v:any) => onChange('prod.vOutro', v)} />
                <FormField label="Frete Item" value={item.prod.vFrete} onChange={(v:any) => onChange('prod.vFrete', v)} />
              </div>
              
              <div className="pt-6 border-t border-gray-100">
                <h5 className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-4">IPI (Imposto sobre Produtos Industrializados)</h5>
                {canEditIpi ? <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-indigo-50/30 p-6 rounded-2xl border border-indigo-100/50">
                  <FormField label="CST IPI" value={item.imposto.IPI?.IPITrib?.CST || "99"} onChange={(v:any) => onChange('imposto.IPI.IPITrib.CST', v)} />
                  <FormField label="Código Enquadramento" value={item.imposto.IPI?.cEnq || "999"} onChange={(v:any) => onChange('imposto.IPI.cEnq', v)} />
                  <FormField label="Base IPI" value={item.imposto.IPI?.IPITrib?.vBC || "0.00"} onChange={(v:any) => onChange('imposto.IPI.IPITrib.vBC', v)} />
                  <FormField label="Alíquota IPI %" value={item.imposto.IPI?.IPITrib?.pIPI || "0.00"} onChange={(v:any) => onChange('imposto.IPI.IPITrib.pIPI', v)} />
                  <FormField label="Valor IPI" value={item.imposto.IPI?.IPITrib?.vIPI || "0.00"} onChange={(v:any) => onChange('imposto.IPI.IPITrib.vIPI', v)} />
                </div> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A variante IPI deste item não é editável aqui. O XML original será preservado.</p>}
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h5 className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-4">Impostos do Item (ICMS/ST)</h5>
                {canEditIcms ? <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-indigo-50/30 p-6 rounded-2xl border border-indigo-100/50">
                  <FormField label="Origem" value={item.imposto.ICMS?.ICMS00?.orig || "0"} onChange={(v:any) => onChange('imposto.ICMS.ICMS00.orig', v)} select={[{v:'0', l:'Nacional'}, {v:'1', l:'Estrangeira'}]} />
                  <FormField label="CST ICMS" value={item.imposto.ICMS?.ICMS00?.CST || "00"} onChange={(v:any) => onChange('imposto.ICMS.ICMS00.CST', v)} />
                  <FormField label="Base de Cálculo" value={item.imposto.ICMS?.ICMS00?.vBC || "0.00"} onChange={(v:any) => onChange('imposto.ICMS.ICMS00.vBC', v)} />
                  <FormField label="Aliquota %" value={item.imposto.ICMS?.ICMS00?.pICMS || "0.00"} onChange={(v:any) => onChange('imposto.ICMS.ICMS00.pICMS', v)} />
                  <FormField label="Valor ICMS" value={item.imposto.ICMS?.ICMS00?.vICMS || "0.00"} onChange={(v:any) => onChange('imposto.ICMS.ICMS00.vICMS', v)} />
                </div> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A variante ICMS deste item não é editável aqui. O XML original será preservado.</p>}
              </div>
              
              <div className="pt-6 border-t border-gray-100">
                <h5 className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-4">PIS / COFINS</h5>
                <div className="space-y-4">
                  {canEditPis ? <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-indigo-50/30 p-6 rounded-2xl border border-indigo-100/50">
                    <FormField label="CST PIS" value={item.imposto.PIS?.PISAliq?.CST || "01"} onChange={(v:any) => onChange('imposto.PIS.PISAliq.CST', v)} />
                    <FormField label="Base PIS" value={item.imposto.PIS?.PISAliq?.vBC || "0.00"} onChange={(v:any) => onChange('imposto.PIS.PISAliq.vBC', v)} />
                    <FormField label="Alíquota PIS %" value={item.imposto.PIS?.PISAliq?.pPIS || "0.00"} onChange={(v:any) => onChange('imposto.PIS.PISAliq.pPIS', v)} />
                    <FormField label="Valor PIS" value={item.imposto.PIS?.PISAliq?.vPIS || "0.00"} onChange={(v:any) => onChange('imposto.PIS.PISAliq.vPIS', v)} />
                  </div> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A variante PIS deste item não é editável aqui. O XML original será preservado.</p>}
                  {canEditCofins ? <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-indigo-50/30 p-6 rounded-2xl border border-indigo-100/50">
                    <FormField label="CST COFINS" value={item.imposto.COFINS?.COFINSAliq?.CST || "01"} onChange={(v:any) => onChange('imposto.COFINS.COFINSAliq.CST', v)} />
                    <FormField label="Base COFINS" value={item.imposto.COFINS?.COFINSAliq?.vBC || "0.00"} onChange={(v:any) => onChange('imposto.COFINS.COFINSAliq.vBC', v)} />
                    <FormField label="Alíquota COFINS %" value={item.imposto.COFINS?.COFINSAliq?.pCOFINS || "0.00"} onChange={(v:any) => onChange('imposto.COFINS.COFINSAliq.pCOFINS', v)} />
                    <FormField label="Valor COFINS" value={item.imposto.COFINS?.COFINSAliq?.vCOFINS || "0.00"} onChange={(v:any) => onChange('imposto.COFINS.COFINSAliq.vCOFINS', v)} />
                  </div> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A variante COFINS deste item não é editável aqui. O XML original será preservado.</p>}
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h5 className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-4">Informações Adicionais do Produto</h5>
                <div className="space-y-4">
                  <FormField label="Informações Adicionais (infAdProd)" value={item.infAdProd || ""} onChange={(v:any) => onChange('infAdProd', v)} />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField label="GTIN" value={item.prod.cEAN} onChange={(v:any) => onChange('prod.cEAN', v)} />
                    <FormField label="CEST" value={item.prod.CEST} onChange={(v:any) => onChange('prod.CEST', v)} />
                    <FormField label="EXTIPI" value={item.prod.EXTIPI} onChange={(v:any) => onChange('prod.EXTIPI', v)} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
