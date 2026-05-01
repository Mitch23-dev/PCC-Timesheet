export function autoGrowTextarea(el: HTMLTextAreaElement) {
  const apply = () => {
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + border}px`;
  };

  apply();
  requestAnimationFrame(apply);
}
