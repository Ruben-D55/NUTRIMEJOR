import P from"@/components/placeholder";export default async function Page({params}:{params:Promise<{tipo:string}>}){const{tipo}=await params;return <P title={`Mis ${tipo}`} phase={3}/>}
