import{NextResponse}from"next/server";export async function POST(){const r=new NextResponse(null,{status:204});r.cookies.set("nm_session","",{maxAge:0,path:"/"});return r}
