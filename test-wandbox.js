async function getCompilers() {
  const res = await fetch("https://wandbox.org/api/list.json");
  const data = await res.json();
  console.log(data.filter(c => c.language === "Python" || c.language === "C++" || c.language === "C" || c.language === "Java" || c.language === "JavaScript").map(c => c.name).join("\\n"));
}
getCompilers();
