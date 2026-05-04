export interface NFeDocument {
  nfeProc: {
    "@_versao": string;
    "@_xmlns": string;
    protNFe?: any;
    NFe: {
      infNFe: {
        "@_Id": string;
        "@_versao"?: string;
        ide: any;
        emit: any;
        dest: any;
        det: any | any[];
        total: any;
        transp: any;
        cobr?: any;
        pag: any;
        infAdic?: any;
        infRespTec?: any;
      };
    };
  };
}

export interface ValidationError {
  path: string;
  message: string;
  section: string;
  type?: 'error' | 'warning';
}
