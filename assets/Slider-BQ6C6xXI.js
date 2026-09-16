import{o as e,r as t}from"./rolldown-runtime-C0FnF6B9.js";import{t as n}from"./react-IpA8Qn9U.js";import{t as r}from"./jsx-runtime-CA2T8_y1.js";var i=t({NormalSlider:()=>s,default:()=>c}),a=e(n(),1),o=e(r(),1);function s({value:e,setValue:t,leftLabel:n=``,rightLabel:r=``,min:i=0,max:s=10,step:c=.1,tickInterval:l=1,onClick:u=()=>{}}){let[d,f]=(0,a.useState)(!1),[p,m]=(0,a.useState)(!1),h=(e-i)/(s-i)*100,g=`#4DABF7`,_=`#339AF0`;`${h}${h}`;let v=[];for(let e=i;e<=s;e+=l)v.push(e);return(0,o.jsxs)(`div`,{style:{position:`relative`,width:`100%`,maxWidth:`700px`,margin:`40px auto`,padding:`40px 10px 40px 10px`},onMouseEnter:()=>f(!0),onMouseLeave:()=>f(!1),children:[(0,o.jsxs)(`div`,{style:{position:`absolute`,left:`calc(${h}% + ${12-h*.24}px)`,transform:`translateX(-50%)`,top:`-10px`,backgroundColor:_,color:`white`,padding:`6px 12px`,borderRadius:`8px`,fontSize:`16px`,fontWeight:`600`,whiteSpace:`nowrap`,boxShadow:`0 4px 12px rgba(0, 0, 0, 0.15)`,pointerEvents:`none`,zIndex:10,transition:`left 0.1s ease`},children:[e.toFixed(2),(0,o.jsx)(`div`,{style:{position:`absolute`,bottom:`-6px`,left:`50%`,transform:`translateX(-50%)`,width:0,height:0,borderLeft:`6px solid transparent`,borderRight:`6px solid transparent`,borderTop:`6px solid ${_}`}})]}),(0,o.jsxs)(`div`,{style:{position:`relative`,width:`100%`,padding:`0`,margin:`0`,overflow:`visible`,height:`12px`},children:[(0,o.jsx)(`div`,{style:{position:`absolute`,left:0,right:0,top:`50%`,transform:`translateY(-50%)`,height:`12px`,borderRadius:`6px`,background:`#E9ECEF`,zIndex:1}}),(0,o.jsx)(`div`,{style:{position:`absolute`,left:0,width:`calc(${h}% + ${12-h*.24}px)`,top:`50%`,transform:`translateY(-50%)`,height:`12px`,borderRadius:`6px`,background:g,zIndex:1,transition:p?`none`:`width 0.3s ease`}}),(0,o.jsx)(`input`,{type:`range`,min:i,max:s,step:c,value:e,onClick:u,onMouseDown:()=>m(!0),onMouseUp:()=>m(!1),onChange:e=>t(parseFloat(e.target.value)),style:{width:`100%`,appearance:`none`,height:`12px`,borderRadius:`6px`,outline:`none`,cursor:`pointer`,position:`relative`,zIndex:2,margin:0,padding:0,boxSizing:`border-box`,background:`transparent`}})]}),(0,o.jsx)(`style`,{children:`
          input[type="range"] {
            -webkit-appearance: none;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          
          input[type="range"]::-webkit-slider-runnable-track {
            width: 100%;
            height: 12px;
            border-radius: 6px;
            background: transparent;
            margin: 0;
            padding: 0;
          }
          
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: ${d||p?`28px`:`24px`};
            height: ${d||p?`28px`:`24px`};
            background: ${_};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), 0 0 0 ${d||p?`4px`:`0px`} ${g}40;
            transition: all 0.2s ease;
            margin-top: -6px;
          }
          input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 4px ${g}40;
          }
          input[type="range"]::-webkit-slider-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 0 6px ${g}40;
          }
          
          input[type="range"]::-moz-range-track {
            width: 100%;
            height: 12px;
            border-radius: 6px;
            background: transparent;
            border: none;
          }
          
          input[type="range"]::-moz-range-thumb {
            width: ${d||p?`28px`:`24px`};
            height: ${d||p?`28px`:`24px`};
            background: ${_};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
          }
          input[type="range"]::-moz-range-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          }
          input[type="range"]::-moz-range-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
          }
        `}),(0,o.jsx)(`div`,{style:{position:`relative`,width:`calc(100% - 24px)`,marginTop:`8px`,marginLeft:`12px`,marginRight:`12px`,boxSizing:`border-box`},children:v.map((t,a)=>{let c=Math.abs(t-e)<l/2,u=(t-i)/(s-i)*100;return(0,o.jsxs)(`div`,{style:{position:`absolute`,left:`${u}%`,transform:`translateX(-50%)`,display:`flex`,flexDirection:`column`,alignItems:`center`,gap:`6px`},children:[(0,o.jsx)(`div`,{style:{width:`3px`,height:`14px`,backgroundColor:c?_:`#ADB5BD`,borderRadius:`1.5px`,transition:`all 0.2s ease`}}),(0,o.jsx)(`span`,{style:{fontSize:`15px`,fontWeight:c?`700`:`600`,color:c?_:`#495057`,transition:`all 0.2s ease`,textAlign:`center`,minWidth:`40px`},children:t.toFixed(1)}),n&&a===0&&(0,o.jsx)(`span`,{style:{fontSize:`14px`,color:`#495057`,fontWeight:`600`,marginTop:`4px`,textAlign:`center`},children:n}),r&&a===v.length-1&&(0,o.jsx)(`span`,{style:{fontSize:`14px`,color:`#495057`,fontWeight:`600`,marginTop:`4px`,textAlign:`center`},children:r})]},t)})})]})}function c({value:e,setValue:t,leftLabel:n=``,rightLabel:r=``,min:i=-1,max:s=1,step:c=.01,tickInterval:l=.2,center:u=0,onClick:d=()=>{}}){let[f,p]=(0,a.useState)(!1),[m,h]=(0,a.useState)(!1),g=(e-i)/(s-i)*100,_=(u-i)/(s-i)*100,v=e>=u,y=v?`#4DABF7`:`#FF6B6B`,b=v?`#339AF0`:`#EE5A6F`,x=e>=u?`linear-gradient(
          to right,
          #E9ECEF 0%,
          #E9ECEF ${_}%,
          ${y} ${_}%,
          ${y} ${g}%,
          #E9ECEF ${g}%,
          #E9ECEF 100%
        )`:`linear-gradient(
          to right,
          #E9ECEF 0%,
          #E9ECEF ${g}%,
          ${y} ${g}%,
          ${y} ${_}%,
          #E9ECEF ${_}%,
          #E9ECEF 100%
        )`,S=[];for(let e=u;e<=s;e+=l)S.push(e);for(let e=u-l;e>=i;e-=l)S.push(e);return S.sort((e,t)=>e-t),(0,o.jsxs)(`div`,{style:{position:`relative`,width:`100%`,maxWidth:`700px`,margin:`40px auto`,padding:`20px 10px 30px 10px`},onMouseEnter:()=>p(!0),onMouseLeave:()=>p(!1),children:[(0,o.jsxs)(`div`,{style:{position:`absolute`,left:`${g}%`,transform:`translateX(-50%)`,top:`-45px`,backgroundColor:b,color:`white`,padding:`6px 12px`,borderRadius:`8px`,fontSize:`14px`,fontWeight:`600`,whiteSpace:`nowrap`,boxShadow:`0 4px 12px rgba(0, 0, 0, 0.15)`,pointerEvents:`none`,zIndex:10,transition:`left 0.1s ease, background-color 0.2s ease`},children:[e.toFixed(2),(0,o.jsx)(`div`,{style:{position:`absolute`,bottom:`-6px`,left:`50%`,transform:`translateX(-50%)`,width:0,height:0,borderLeft:`6px solid transparent`,borderRight:`6px solid transparent`,borderTop:`6px solid ${b}`}})]}),(0,o.jsxs)(`div`,{style:{position:`relative`,width:`100%`,padding:`12px 0`},children:[(0,o.jsx)(`div`,{style:{position:`absolute`,left:`${_}%`,top:`12px`,width:`2px`,height:`12px`,backgroundColor:`#868E96`,transform:`translateX(-50%)`,zIndex:1,borderRadius:`1px`}}),(0,o.jsx)(`input`,{type:`range`,min:i,max:s,step:c,value:e,onClick:d,onMouseDown:()=>h(!0),onMouseUp:()=>h(!1),onChange:e=>t(parseFloat(e.target.value)),style:{width:`100%`,appearance:`none`,height:`12px`,borderRadius:`6px`,background:x,outline:`none`,transition:m?`none`:`background 0.3s ease`,cursor:`pointer`,position:`relative`,zIndex:2}})]}),(0,o.jsx)(`style`,{children:`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: ${f||m?`28px`:`24px`};
            height: ${f||m?`28px`:`24px`};
            background: ${b};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), 0 0 0 ${f||m?`4px`:`0px`} ${y}40;
            transition: all 0.2s ease;
          }
          input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 4px ${y}40;
          }
          input[type="range"]::-webkit-slider-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 0 6px ${y}40;
          }
          
          input[type="range"]::-moz-range-thumb {
            width: ${f||m?`28px`:`24px`};
            height: ${f||m?`28px`:`24px`};
            background: ${b};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
          }
          input[type="range"]::-moz-range-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          }
          input[type="range"]::-moz-range-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
          }
          
          input[type="range"]::-moz-range-track {
            height: 12px;
            border-radius: 6px;
          }
        `}),(0,o.jsx)(`div`,{style:{position:`relative`,width:`100%`,marginTop:`8px`},children:S.map((t,a)=>{let d=Math.abs(t-u)<c/2,f=Math.abs(t-e)<l/2;return(0,o.jsxs)(`div`,{style:{position:`absolute`,left:`${(t-i)/(s-i)*100}%`,transform:`translateX(-50%)`,display:`flex`,flexDirection:`column`,alignItems:`center`,gap:`4px`},children:[(0,o.jsx)(`div`,{style:{width:d?`3px`:`2px`,height:d?`16px`:`12px`,backgroundColor:d?`#495057`:f?b:`#CED4DA`,borderRadius:`1px`,transition:`all 0.2s ease`}}),(0,o.jsx)(`span`,{style:{fontSize:d?`14px`:`13px`,fontWeight:d||f?`600`:`500`,color:d?`#495057`:f?b:`#868E96`,transition:`all 0.2s ease`,textAlign:`center`,minWidth:`40px`},children:t.toFixed(1)}),n&&a===0&&(0,o.jsx)(`span`,{style:{fontSize:`11px`,color:`#868E96`,fontWeight:`500`,marginTop:`2px`,textAlign:`center`},children:n}),r&&a===S.length-1&&(0,o.jsx)(`span`,{style:{fontSize:`11px`,color:`#868E96`,fontWeight:`500`,marginTop:`2px`,textAlign:`center`},children:r})]},t)})})]})}export{i as n,s as t};