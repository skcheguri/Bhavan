export default function About() {
  const values = [
    {
      icon: 'ri-shield-check-line',
      title: 'Trust & Safety',
      description: 'We verify every landlord and property listing to ensure a safe and transparent rental experience for all users.',
    },
    {
      icon: 'ri-heart-line',
      title: 'Community First',
      description: 'We believe renters deserve a supportive community where they can share experiences and help each other.',
    },
    {
      icon: 'ri-lightbulb-line',
      title: 'Innovation',
      description: 'We continuously develop new tools and features to make renting easier, more transparent, and more efficient.',
    },
    {
      icon: 'ri-equalizer-line',
      title: 'Fairness',
      description: 'We advocate for fair rental practices and empower renters with the knowledge and tools they need.',
    },
  ];

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Header */}
      <section className="bg-white py-12 md:py-16 border-b">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-charcoal">About Us</h1>
            <p className="mt-2 text-charcoal/70 max-w-2xl">
              We are on a mission to transform the rental experience for millions of renters worldwide.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-charcoal">Our Mission</h2>
                <p className="mt-4 text-charcoal/70 leading-relaxed">
                  Bhavan was founded in 2025 with a simple belief: renting a home in India should be straightforward, transparent, and empowering. We saw too many renters struggling with opaque processes, unresponsive landlords, and a lack of community support.
                </p>
                <p className="mt-4 text-charcoal/70 leading-relaxed">
                  Today, we are building the most renter-friendly platform in India. From verified listings in Mumbai, Bangalore, and Delhi to digital rent management and a thriving community, we are here to make your rental journey smooth from start to finish.
                </p>
              </div>
              <div>
                <img
                  src="/placeholders/photo.svg"
                  alt="Our team"
                  className="rounded-2xl shadow-lg w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white py-16 md:py-24">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal">Our Values</h2>
              <p className="mt-3 text-charcoal/70">The principles that guide everything we do</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="bg-offwhite rounded-2xl p-6 text-center hover:shadow-md transition duration-300"
                >
                  <div className="w-14 h-14 mx-auto rounded-full bg-brand/10 flex items-center justify-center mb-4">
                    <div className="w-7 h-7 flex items-center justify-center">
                      <i className={`${value.icon} text-brand text-xl`} />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-charcoal">{value.title}</h3>
                  <p className="mt-2 text-sm text-charcoal/70">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}