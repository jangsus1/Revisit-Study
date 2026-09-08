import{o as e,r as t}from"./rolldown-runtime-C0FnF6B9.js";import{t as n}from"./jsx-runtime-CA2T8_y1.js";var r=t({default:()=>a}),i=e(n(),1);function a({value:e,setValue:t,leftLabel:n=``,rightLabel:r=``,min:a=-1,max:o=1,step:s=.01,tickInterval:c=.2,center:l=0,onClick:u=()=>{}}){let d=(e-a)/(o-a)*100,f=(l-a)/(o-a)*100,p=e>=l?`linear-gradient(
          to right,
          lightgray 0%,
          lightgray ${f}%,
          #228BE6 ${f}%,
          #228BE6 ${d}%,
          lightgray ${d}%,
          lightgray 100%
        )`:`linear-gradient(
          to right,
          lightgray 0%,
          lightgray ${d}%,
          #228BE6 ${d}%,
          #228BE6 ${f}%,
          lightgray ${f}%,
          lightgray 100%
        )`,m=[];for(let e=l;e<=o;e+=c)m.push(e);for(let e=l-c;e>=a;e-=c)m.push(e);return(0,i.jsxs)(`div`,{style:{position:`relative`,width:`100%`,maxWidth:`600px`,margin:`50px auto`},children:[(0,i.jsx)(`input`,{type:`range`,min:a,max:o,step:s,value:e,onClick:u,onChange:e=>t(parseFloat(e.target.value)),style:{width:`100%`,appearance:`none`,height:`8px`,borderRadius:`4px`,background:p,outline:`none`,transition:`background 0.2s`}}),(0,i.jsx)(`style`,{children:`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: 20px;
            height: 20px;
            background: white;
            border: 3px solid black;
            border-radius: 50%;
            cursor: pointer;
          }
          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            background: white;
            border: 3px solid black;
            border-radius: 50%;
            cursor: pointer;
          }
        `}),(0,i.jsx)(`div`,{style:{position:`relative`,display:`flex`,justifyContent:`space-between`,width:`100%`,marginTop:`10px`,fontSize:`14px`,color:`gray`},children:m.map((e,t)=>(0,i.jsxs)(`span`,{style:{position:`absolute`,left:`${(e-a)/(o-a)*100}%`,transform:`translateX(-10%)`,top:`15px`,width:`50px`},children:[` `,(0,i.jsxs)(i.Fragment,{children:[e.toFixed(1),(0,i.jsx)(`br`,{}),t===m.length-1&&n,t===3&&r]})]},e))})]})}export{r as n,a as t};